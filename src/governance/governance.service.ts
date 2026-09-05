import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { Brackets, DataSource, ILike, In, IsNull } from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import { pageOf } from '../common/api-response';
import { DomainError } from '../common/domain-error';
import { RequestContext, submittedBy } from '../common/request-context';
import { toOrder } from '../common/page-query.dto';
import { VerificationEventEntity } from '../codes/code.entity';
import { OrganizationDocumentEntity, OrganizationEntity } from '../onboarding/onboarding.entity';
import { AuditLogEntity } from '../operations/operations.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { CreateProductDto } from '../products/dto/product.dto';
import { ProductService } from '../products/product.service';
import { ProductImageStorageService } from '../products/product-image-storage.service';
import { DocumentStorageService } from '../onboarding/document-storage.service';
import { DocumentSecurityService } from '../onboarding/document-security.service';
import { MalwareScannerService } from '../onboarding/malware-scanner.service';
import { ReliabilityService } from '../operations/reliability.service';
import { EmailTemplateService } from '../operations/email-template.service';
import { vendorAccountCreatedEmail } from '../operations/email-templates';
import {
  AddCaseNoteDto, AuditExceptionQueryDto, CreateAuditExceptionDto,
  CreateChangeRequestDto, CreateFraudCaseDto, CreateIncidentDto,
  FraudCaseQueryDto, InviteVendorDto, PlatformProductQueryDto,
  ResolveAuditExceptionDto, UpdateFraudCaseDto, UpdateIncidentDto,
  VendorLifecycleDto, ChangeRequestQueryDto, OptionQueryDto, CreateOptionDto, UpdateOptionDto,
} from './governance.dto';
import {
  AuditExceptionEntity, FraudCaseEntity, FraudCaseNoteEntity,
  OrganizationChangeRequestEntity, SystemIncidentEntity, UserMfaFactorEntity,
  VendorInvitationEntity, VendorStatusHistoryEntity, SystemComponentEntity, MfaLoginChallengeEntity, ApplicationOptionEntity, ApplicationOptionHistoryEntity,
} from './governance.entity';

function csvCell(value: unknown): string { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function csv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
}
function age(value: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(input: Buffer): string {
  let bits = '', out = '';
  for (const b of input) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function base32Decode(input: string): Buffer {
  let bits = '';
  for (const c of input.replace(/=+$/, '').toUpperCase()) { const i = BASE32.indexOf(c); if (i >= 0) bits += i.toString(2).padStart(5, '0'); }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret: string, step = Math.floor(Date.now() / 30000)): string {
  const counter = Buffer.alloc(8); counter.writeBigInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
export type UploadedVendorFile = { buffer: Buffer; size: number; mimetype: string; originalname: string };

@Injectable()
export class GovernanceService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService, private readonly documents: DocumentStorageService, private readonly documentSecurity: DocumentSecurityService, private readonly malware: MalwareScannerService, private readonly reliability: ReliabilityService, private readonly emailTemplates: EmailTemplateService, private readonly productService: ProductService, private readonly productImages: ProductImageStorageService) {}
  private audit<T extends object>(u: RequestContext, data: T): T & { createdById: string; updatedById: string } {
    return { ...data, createdById: u.userId, updatedById: u.userId };
  }
  private encryptionKey(): Buffer {
    const raw = this.config.get<string>('MFA_ENCRYPTION_KEY') || this.config.get<string>('JWT_SECRET');
    if (!raw) throw new DomainError('MFA encryption is not configured', 'MFA_NOT_CONFIGURED', 503);
    return createHash('sha256').update(raw).digest();
  }
  private encrypt(value: string): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
  }
  private decrypt(value: string): string {
    const parts = value.split('.');
    if (parts.length !== 3) throw new DomainError('MFA secret is invalid', 'MFA_SECRET_INVALID', 500);
    const iv = Buffer.from(parts[0]!, 'base64url');
    const tag = Buffer.from(parts[1]!, 'base64url');
    const body = Buffer.from(parts[2]!, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), iv); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  }

  async createChangeRequest(u: RequestContext, dto: CreateChangeRequestDto) {
    const repo = this.db.getRepository(OrganizationChangeRequestEntity);
    const row = repo.create(this.audit(u, { organizationId: u.organizationId, details: dto.details.trim(), requestedChanges: dto.requestedChanges ?? {} }));
    const saved = await repo.save(row);
    return { id: saved.id, reference: `CR-${saved.id.slice(0, 8).toUpperCase()}`, status: saved.status, message: 'Your change request has been submitted.' };
  }

  private validateOptionValue(type:string,value:unknown,rules:Record<string,unknown>={}){
    const valid=type==='array'?Array.isArray(value):type==='object'?Boolean(value)&&typeof value==='object'&&!Array.isArray(value):typeof value===type;
    if(!valid)throw new DomainError(`Option value must be ${type}`,'OPTION_VALUE_INVALID',400);
    if(type==='number'){const n=value as number;if(typeof rules.min==='number'&&n<rules.min)throw new DomainError('Option value is below its minimum','OPTION_VALUE_INVALID',400);if(typeof rules.max==='number'&&n>rules.max)throw new DomainError('Option value exceeds its maximum','OPTION_VALUE_INVALID',400);}
    if(Array.isArray(rules.allowed)&&!rules.allowed.some((v)=>JSON.stringify(v)===JSON.stringify(value)))throw new DomainError('Option value is not allowed','OPTION_VALUE_INVALID',400);
  }
  private isVerificationCodeLengthOption(namespace:string,key:string){return namespace==='codes'&&key==='verification_code_length';}
  private validateVerificationCodeLengthOption(namespace:string,key:string,value:unknown,organizationId?:string|null,isPublic?:boolean){
    if(!this.isVerificationCodeLengthOption(namespace,key))return;
    void value;void organizationId;void isPublic;
    throw new DomainError('Production verification codes use the fixed GVE-16 format and cannot be configured','OPTION_VALUE_INVALID',400);
  }
  async publicOptions(namespace?:string){return this.db.getRepository(ApplicationOptionEntity).find({where:{...(namespace?{namespace}:{}),isPublic:true,isActive:true,organizationId:IsNull()},order:{namespace:'ASC',sortOrder:'ASC',label:'ASC'},select:{id:true,namespace:true,key:true,label:true,value:true,valueType:true,description:true,sortOrder:true,updatedAt:true}});}
  async allOptions(){return this.db.getRepository(ApplicationOptionEntity).find({order:{namespace:'ASC',sortOrder:'ASC',label:'ASC'}});}
  async listOptions(q:OptionQueryDto){const repo=this.db.getRepository(ApplicationOptionEntity),where:any={...(q.namespace?{namespace:q.namespace}:{}),...(q.organizationId?{organizationId:q.organizationId}:{}),...(q.active?{isActive:q.active==='true'}:{}),...(q.search?{label:ILike(`%${q.search}%`)}:{})};const [rows,total]=await repo.findAndCount({where,order:toOrder(q.sortBy,q.sortDirection,['namespace','key','label','sortOrder','createdAt','updatedAt']as const,'namespace'),skip:(q.page-1)*q.pageSize,take:q.pageSize});return pageOf(rows,total,q.page,q.pageSize,q.sortBy,q.sortDirection);}
  async createOption(u:RequestContext,dto:CreateOptionDto){this.validateVerificationCodeLengthOption(dto.namespace,dto.key,dto.value,dto.organizationId,dto.isPublic);const rules=this.isVerificationCodeLengthOption(dto.namespace,dto.key)?{min:6,max:28}:dto.validation??{};this.validateOptionValue(dto.valueType,dto.value,rules);const repo=this.db.getRepository(ApplicationOptionEntity);const existing=await repo.findOneBy({namespace:dto.namespace,key:dto.key,organizationId:dto.organizationId??IsNull() as any});if(existing)throw new DomainError('An option with this namespace and key already exists','OPTION_EXISTS',409);const row=await repo.save(repo.create(this.audit(u,{...dto,organizationId:dto.organizationId??null,validation:rules,isPublic:dto.isPublic??false,isActive:dto.isActive??true,sortOrder:dto.sortOrder??0})));await this.optionHistory(u,row,'create',dto.reason);return row;}
  async updateOption(u:RequestContext,id:string,dto:UpdateOptionDto){const repo=this.db.getRepository(ApplicationOptionEntity),row=await repo.findOneBy({id});if(!row)throw new DomainError('Option was not found','OPTION_NOT_FOUND',404);const value=dto.value===undefined?row.value:dto.value,isCodeLength=this.isVerificationCodeLengthOption(row.namespace,row.key);if(isCodeLength&&dto.isActive===false)throw new DomainError('Verification-code length cannot be disabled','OPTION_VALUE_INVALID',400);this.validateVerificationCodeLengthOption(row.namespace,row.key,value,row.organizationId,dto.isPublic??row.isPublic);const rules=isCodeLength?{min:6,max:28}:dto.validation??row.validation;this.validateOptionValue(row.valueType,value,rules);Object.assign(row,dto,{value,validation:rules,updatedById:u.userId});const saved=await repo.save(row);await this.optionHistory(u,saved,'update',dto.reason);return saved;}
  async optionHistory(u:RequestContext,row:ApplicationOptionEntity,action:string,reason?:string){const repo=this.db.getRepository(ApplicationOptionHistoryEntity);const {encryptedSecret,...snapshot}=row as any;void encryptedSecret;return repo.save(repo.create(this.audit(u,{optionId:row.id,action,snapshot,reason})));}
  async optionHistoryList(id:string){return this.db.getRepository(ApplicationOptionHistoryEntity).find({where:{optionId:id},order:{createdAt:'DESC'},take:100});}
  async listChangeRequests(q: ChangeRequestQueryDto) {
    const repo = this.db.getRepository(OrganizationChangeRequestEntity);
    const where:any = { ...(q.status ? { status:q.status } : {}), ...(q.organizationId ? { organizationId:q.organizationId } : {}), ...(q.search ? { details:ILike(`%${q.search}%`) } : {}) };
    const [rows,total]=await repo.findAndCount({where,order:{createdAt:'DESC'},skip:(q.page-1)*q.pageSize,take:q.pageSize});
    return pageOf(rows,total,q.page,q.pageSize,'createdAt','desc');
  }
  async reviewChangeRequest(u:RequestContext,id:string,status:string,notes?:string){const repo=this.db.getRepository(OrganizationChangeRequestEntity),row=await repo.findOneBy({id});if(!row)throw new DomainError('Change request was not found','CHANGE_REQUEST_NOT_FOUND',404);if(row.status!=='pending')throw new DomainError('Change request has already been reviewed','CHANGE_REQUEST_STATE_INVALID',409);Object.assign(row,{status,reviewNotes:notes,reviewedById:u.userId,reviewedAt:new Date(),updatedById:u.userId});await repo.save(row);await this.writeAudit(u,`organization.change_request.${status}`,'organization_change_request',id,{notes});return row;}

  async listProducts(q: PlatformProductQueryDto) {
    const repo = this.db.getRepository(ProductEntity);
    const where: any = { ...(q.status ? { status: q.status } : {}), ...(q.organizationId ? { organizationId: q.organizationId } : {}), ...(q.search ? { name: ILike(`%${q.search}%`) } : {}) };
    const order = toOrder(q.sortBy, q.sortDirection, ['createdAt','updatedAt','name','status','totalCodes','scanned'] as const, 'updatedAt');
    const [rows, total] = await repo.findAndCount({ where, order, skip: (q.page - 1) * q.pageSize, take: q.pageSize });
    const orgIds = [...new Set(rows.map((r) => r.organizationId))];
    const orgs = orgIds.length ? await this.db.getRepository(OrganizationEntity).find({ where: { id: In(orgIds) } }) : [];
    const names = new Map(orgs.map((o) => [o.id, o.companyName]));
    return pageOf(rows.map((p) => ({ ...p, vendor: names.get(p.organizationId) ?? 'Organization', vendorId: p.organizationId, codes: p.totalCodes, scans: p.scanned })), total, q.page, q.pageSize, q.sortBy, q.sortDirection);
  }
  async productMetrics() {
    const rows = await this.db.getRepository(ProductEntity).createQueryBuilder('p').select('p.status','status').addSelect('COUNT(*)','count').groupBy('p.status').getRawMany();
    const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
    return { total: Object.values(counts).reduce((a: number, b: any) => a + Number(b), 0), verified: counts.active ?? 0, pendingApproval: counts.pending ?? 0, archived: counts.archived ?? 0, rejected: counts.rejected ?? 0 };
  }
  async product(id: string) {
    const row = await this.db.getRepository(ProductEntity).findOneBy({ id });
    if (!row) throw new DomainError('Product was not found', 'PRODUCT_NOT_FOUND', 404);
    const org = await this.db.getRepository(OrganizationEntity).findOneBy({ id: row.organizationId });
    return { ...row, vendor: org?.companyName ?? 'Organization', vendorId: row.organizationId, codes: row.totalCodes, scans: row.scanned };
  }
  async createProductForVendor(u: RequestContext, vendorId: string, dto: CreateProductDto) {
    await this.approvedVendor(vendorId);
    const product = await this.productService.create(vendorId, u, dto);
    await this.writeAudit(u, 'platform.product.created_for_vendor', 'product', product.id, { vendorId });
    return product;
  }
  async createProductImageUploadForVendor(vendorId: string, fileName: string) {
    await this.approvedVendor(vendorId);
    return this.productImages.createUpload(vendorId, fileName);
  }
  async createProductDocumentUploadForVendor(vendorId: string, fileName: string) {
    await this.approvedVendor(vendorId);
    return this.productImages.createDocumentUpload(vendorId, fileName);
  }
  async deleteProductImageForVendor(u: RequestContext, vendorId: string, productId: string) {
    await this.vendor(vendorId);
    const result = await this.productService.deleteImage(productId, vendorId);
    await this.writeAudit(u, 'platform.product.image_deleted_for_vendor', 'product', productId, { vendorId });
    return result;
  }
  async deleteProductDocumentForVendor(u: RequestContext, vendorId: string, productId: string) {
    await this.vendor(vendorId);
    const result = await this.productService.deleteDocument(productId, vendorId);
    await this.writeAudit(u, 'platform.product.document_deleted_for_vendor', 'product', productId, { vendorId });
    return result;
  }
  async deleteVendorDocument(u: RequestContext, vendorId: string, documentId: string) {
    await this.vendor(vendorId);
    const repository = this.db.getRepository(OrganizationDocumentEntity);
    const document = await repository.findOneBy({ id: documentId, organizationId: vendorId });
    if (!document) throw new DomainError('Vendor document was not found', 'DOCUMENT_NOT_FOUND', 404);
    await this.documents.remove(document.storageKey);
    await repository.delete({ id: documentId, organizationId: vendorId });
    await this.writeAudit(u, 'platform.vendor.document_deleted', 'organization_document', documentId, { vendorId, type: document.type, fileName: document.fileName });
    return { deleted: true };
  }
  async createVendorLogoUpload(vendorId: string, fileName: string) {
    await this.vendor(vendorId);
    return this.productImages.createVendorLogoUpload(vendorId, fileName);
  }
  async setVendorLogo(u: RequestContext, vendorId: string, logoUrl: string) {
    const organization = await this.vendor(vendorId);
    this.productImages.assertVendorLogo(vendorId, logoUrl);
    const previousLogoUrl = organization.logoUrl;
    organization.logoUrl = logoUrl;
    const saved = await this.db.getRepository(OrganizationEntity).save(organization);
    if (previousLogoUrl && previousLogoUrl !== logoUrl) await this.productImages.removeVendorLogo(vendorId, previousLogoUrl);
    await this.writeAudit(u, 'platform.vendor.logo_updated', 'organization', vendorId, {});
    return saved;
  }
  async deleteVendorLogo(u: RequestContext, vendorId: string) {
    const organization = await this.vendor(vendorId);
    if (!organization.logoUrl) throw new DomainError('The vendor does not have a company image', 'VENDOR_LOGO_NOT_FOUND', 404);
    await this.productImages.removeVendorLogo(vendorId, organization.logoUrl);
    organization.logoUrl = null;
    const saved = await this.db.getRepository(OrganizationEntity).save(organization);
    await this.writeAudit(u, 'platform.vendor.logo_deleted', 'organization', vendorId, {});
    return { deleted: true, vendor: saved };
  }
  private async approvedVendor(vendorId: string) {
    const organization = await this.vendor(vendorId);
    if (organization.status !== 'approved') throw new DomainError('The vendor account must be approved before products can be created', 'ACCOUNT_NOT_ACTIVATED', 403);
    return organization;
  }
  private async vendor(vendorId: string) {
    const organization = await this.db.getRepository(OrganizationEntity).findOneBy({ id: vendorId });
    if (!organization) throw new DomainError('Vendor was not found', 'VENDOR_NOT_FOUND', 404);
    return organization;
  }
  async setProductStatus(u: RequestContext, id: string, status: string, reason?: string) {
    const repo = this.db.getRepository(ProductEntity), row = await repo.findOneBy({ id });
    if (!row) throw new DomainError('Product was not found', 'PRODUCT_NOT_FOUND', 404);
    row.status = status as ProductStatus; row.rejectionReason = status === 'rejected' ? reason : undefined; if(status==='active')row.approvedBy=submittedBy(u); row.updatedAt = new Date();
    const saved = await repo.save(row);
    await this.writeAudit(u, 'platform.product.status_changed', 'product', id, { status, reason });
    return saved;
  }

  private temporaryPassword() {
    const lower = 'abcdefghijkmnopqrstuvwxyz', upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', digits = '23456789', symbols = '!@#$%';
    const pick = (set: string) => set[randomInt(set.length)]!;
    const chars = [pick(lower), pick(upper), pick(digits), pick(symbols), ...Array.from({ length: 12 }, () => pick(lower + upper + digits + symbols))];
    for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j]!, chars[i]!]; }
    return chars.join('');
  }
  private contactName(name: string) { const [firstName = '', ...rest] = name.trim().split(/\s+/); return { firstName, lastName: rest.join(' ') }; }
  async inviteVendor(u: RequestContext, dto: InviteVendorDto, files: Record<string, UploadedVendorFile[]> = {}) {
    const email = dto.email.trim().toLowerCase(), vendorName = dto.vendorName.trim(), contactPerson = dto.contactPerson.trim();
    const supplied = ['cac', 'tax', 'other'].flatMap((type) => (files[type] ?? []).map((file) => ({ type, file })));
    if (!(files.cac?.length)) throw new DomainError('A CAC Certificate is required to add a vendor', 'CAC_DOCUMENT_REQUIRED', 400);
    if (supplied.length > 3) throw new DomainError('A maximum of three documents can be uploaded', 'DOCUMENT_LIMIT_EXCEEDED', 400);
    for (const { file } of supplied) {
      if (file.size > 5 * 1024 * 1024) throw new DomainError('Each document must be 5MB or smaller', 'DOCUMENT_TOO_LARGE', 400);
      if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimetype)) throw new DomainError('Documents must be PDF, PNG, or JPEG files', 'DOCUMENT_TYPE_INVALID', 400);
      this.documentSecurity.inspect(file.buffer, file.mimetype, file.size);
      await this.malware.assertClean(file.buffer, file.originalname, file.mimetype);
    }
    if (await this.db.getRepository(UserEntity).existsBy({ email })) throw new DomainError('A user already exists for this email', 'VENDOR_EMAIL_ALREADY_REGISTERED', 409);
    if (await this.db.getRepository(VendorInvitationEntity).existsBy({ email, status: 'pending' })) throw new DomainError('An active vendor invitation already exists', 'VENDOR_INVITATION_EXISTS', 409);
    const temporaryPassword = this.temporaryPassword(), registrationNumber = `GV-${randomBytes(10).toString('hex').toUpperCase()}`, token = randomBytes(32).toString('base64url'), organizationId = randomUUID();
    const stored: Array<{ type: string; fileName: string; mimeType: string; size: number; storageKey: string; sha256: string }> = [];
    try {
      for (const { type, file } of supplied) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160) || 'document';
        const storageKey = `organizations/${organizationId}/documents/${randomUUID()}-${safeName}`;
        const { sha256 } = this.documentSecurity.inspect(file.buffer, file.mimetype, file.size);
        await this.documents.upload(storageKey, file.buffer, file.mimetype);
        stored.push({ type, fileName: safeName, mimeType: file.mimetype, size: file.size, storageKey, sha256 });
      }
      const result = await this.db.transaction(async manager => {
        const organization = await manager.save(OrganizationEntity, manager.create(OrganizationEntity, { id: organizationId, companyName: vendorName, registrationNumber, industry: 'Not provided', country: 'Not provided', administrator: { firstName: contactPerson.split(/\s+/)[0] ?? '', lastName: contactPerson.split(/\s+/).slice(1).join(' '), email, phone: 'Not provided' }, address: { line1: 'Not provided', city: 'Not provided', state: 'Not provided', country: 'Not provided', postalCode: 'Not provided' }, documents: [], submittedBy:submittedBy(u), status: 'submitted' }));
        const name = this.contactName(contactPerson);
        const user = await manager.save(UserEntity, manager.create(UserEntity, { email, organizationId: organization.id, passwordHash: await argon2.hash(temporaryPassword, { type:argon2.argon2id }), role:'vendor_admin', isActive:false, mustChangePassword:true, ...name }));
        if (stored.length) await manager.save(OrganizationDocumentEntity, stored.map(document => manager.create(OrganizationDocumentEntity, { organizationId: organization.id, type: document.type, fileName: document.fileName, mimeType: document.mimeType, size: document.size, storageKey: document.storageKey, status: 'verified', sha256: document.sha256, uploadedBy: u.userId })));
        const invitation = await manager.save(VendorInvitationEntity, manager.create(VendorInvitationEntity, this.audit(u, { vendorName, contactPerson, email, status: 'accepted', tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(), acceptedAt: new Date(), organizationId: organization.id, userId: user.id, documents: stored })));
        const variables = { firstName: name.firstName, companyName: vendorName, email, temporaryPassword, loginUrl: `${process.env.APP_PUBLIC_URL ?? 'http://localhost:5173'}/login` };
        const content = await this.emailTemplates.render(manager, 'vendor.account_created', variables, () => vendorAccountCreatedEmail(variables));
        await this.reliability.enqueue(manager, 'email.send', 'vendor-account', invitation.id, { to: email, ...content });
        await manager.save(AuditLogEntity, manager.create(AuditLogEntity, { organizationId: u.organizationId, actorId: u.userId, action: 'platform.vendor.created', resourceType: 'organization', resourceId: organization.id, status: 'success', metadata: { vendorInvitationId: invitation.id, documentCount: stored.length } }));
        return { invitation, organization, user };
      });
      return { id: result.organization.id, invitationId: result.invitation.id, email, status: 'pending', documentsUploaded: stored.length, submittedBy:result.organization.submittedBy };
    } catch (error) {
      await Promise.allSettled(stored.map((document) => this.documents.remove(document.storageKey)));
      throw error;
    }
  }
  async vendorLifecycle(u: RequestContext, id: string, toStatus: string, dto: VendorLifecycleDto) {
    return this.db.transaction(async (m) => {
      const org = await m.findOneBy(OrganizationEntity, { id });
      if (!org) throw new DomainError('Vendor was not found', 'VENDOR_NOT_FOUND', 404);
      const fromStatus = org.status; org.status = toStatus; if(toStatus==='approved')org.approvedBy=submittedBy(u); await m.save(org); await m.update(UserEntity,{organizationId:id},{isActive:toStatus==='approved'});
      await m.save(VendorStatusHistoryEntity, m.create(VendorStatusHistoryEntity, this.audit(u, { organizationId: id, fromStatus, toStatus, reason: dto.reason })));
      await m.save(AuditLogEntity, m.create(AuditLogEntity, { organizationId: u.organizationId, actorId: u.userId, action: `vendor.${toStatus}`, resourceType: 'organization', resourceId: id, status: 'success', metadata: { fromStatus, toStatus, reason: dto.reason } }));
      return org;
    });
  }

  async listFraud(q: FraudCaseQueryDto) {
    const repo = this.db.getRepository(FraudCaseEntity), qb = repo.createQueryBuilder('c').where('c.deletedAt IS NULL');
    if (q.severity) qb.andWhere('c.severity = :severity', { severity: q.severity });
    if (q.status) qb.andWhere('c.status = :status', { status: q.status });
    if (q.category) qb.andWhere('c.category = :category', { category: q.category });
    if (q.search) qb.andWhere(new Brackets((x) => x.where('c.title ILIKE :s').orWhere('c.description ILIKE :s')), { s: `%${q.search}%` });
    qb.orderBy(`c.${q.sortBy}`, q.sortDirection.toUpperCase() as 'ASC'|'DESC').skip((q.page - 1) * q.pageSize).take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((c) => ({ id: c.id, code: c.verificationEventId ?? c.id.slice(0, 16), pattern: c.category, severity: c.severity, since: age(c.createdAt), vendor: c.organizationId ?? 'Unknown', status: c.status, title: c.title })), page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  }
  async fraudOverview() {
    const repo = this.db.getRepository(FraudCaseEntity), queue = await repo.find({ where: { status: 'open' }, order: { createdAt: 'DESC' }, take: 10 });
    const grouped = await repo.createQueryBuilder('c').select('c.severity','severity').addSelect('COUNT(*)','count').where("c.status NOT IN ('resolved','dismissed')").groupBy('c.severity').getRawMany();
    const total = await repo.count();
    return { dateRangeLabel: 'All time', updatedLabel: 'Updated just now', kpis: [{ key:'totalAlerts',label:'Total alerts',value:String(total),trendLabel:'Persisted cases',tone:'blue',accent:'#0b66c3' }], queue: queue.map((c) => ({ id:c.id,code:c.verificationEventId ?? c.id.slice(0,16),pattern:c.category,severity:c.severity,since:age(c.createdAt),vendor:c.organizationId ?? 'Unknown' })), severityBacklog: grouped.map((r) => ({ severity:r.severity,label:r.severity,count:Number(r.count) })), totalAlerts: total, anomalyFamilies: [], collateralImpact: [], opsPerformance: [], enforcement: [] };
  }
  async createFraud(u: RequestContext, dto: CreateFraudCaseDto) { const r=this.db.getRepository(FraudCaseEntity); return r.save(r.create(this.audit(u,{...dto,status:'open',signals:dto.signals??{}}))); }
  async updateFraud(u: RequestContext, id: string, dto: UpdateFraudCaseDto) { const r=this.db.getRepository(FraudCaseEntity), row=await r.findOneBy({id}); if(!row)throw new DomainError('Fraud case was not found','FRAUD_CASE_NOT_FOUND',404); Object.assign(row,dto,{updatedById:u.userId,...(dto.status==='resolved'?{resolvedAt:new Date()}: {})}); return r.save(row); }
  async addFraudNote(u:RequestContext,id:string,dto:AddCaseNoteDto){if(!await this.db.getRepository(FraudCaseEntity).existsBy({id}))throw new DomainError('Fraud case was not found','FRAUD_CASE_NOT_FOUND',404);const r=this.db.getRepository(FraudCaseNoteEntity);return r.save(r.create(this.audit(u,{caseId:id,body:dto.body,evidence:dto.evidence??[]})));}

  async listExceptions(q: AuditExceptionQueryDto) { const r=this.db.getRepository(AuditExceptionEntity),search=q.query??q.search; const where:any={...(q.severity&&q.severity!=='all'?{severity:q.severity}:{}),...(q.status&&q.status!=='all'?{status:q.status}:{}),...(search?{title:ILike(`%${search}%`)}:{})}; const [rows,total]=await r.findAndCount({where,order:toOrder(q.sortBy,q.sortDirection,['createdAt','updatedAt','severity','status'] as const,'createdAt'),skip:(q.page-1)*q.pageSize,take:q.pageSize});return {items:rows.map(x=>({id:x.id,exception:x.title,severity:x.severity,age:age(x.createdAt),ageLabel:x.createdAt.toISOString(),status:x.status,closure:x.resolutionComment?{comment:x.resolutionComment,evidenceFileName:x.evidence[0]?.fileName}:undefined,kind:x.kind,correlationId:x.correlationId,requestMethod:x.requestMethod,requestPath:x.requestPath,originalStatus:x.originalStatus,errorCode:x.errorCode,details:x.details})),total,page:q.page,pageSize:q.pageSize,totalPages:Math.max(1,Math.ceil(total/q.pageSize))}; }
  async createException(u:RequestContext,dto:CreateAuditExceptionDto){const r=this.db.getRepository(AuditExceptionEntity);return r.save(r.create(this.audit(u,{...dto,status:'open',kind:'control',metadata:{}})));}
  async resolveException(u:RequestContext,id:string,dto:ResolveAuditExceptionDto){const r=this.db.getRepository(AuditExceptionEntity),row=await r.findOneBy({id});if(!row)throw new DomainError('Audit exception was not found','AUDIT_EXCEPTION_NOT_FOUND',404);Object.assign(row,{status:'closed',resolutionComment:dto.comment,evidence:dto.evidenceFileName?[{fileName:dto.evidenceFileName,url:dto.evidenceUrl}]:[],resolvedById:u.userId,resolvedAt:new Date(),updatedById:u.userId});return r.save(row);}

  async systemHealth() {
    const started=Date.now(); let database:'healthy'|'critical'='healthy'; try{await this.db.query('SELECT 1');}catch{database='critical';}
    const [incidents,configured]=await Promise.all([this.db.getRepository(SystemIncidentEntity).find({where:{status:In(['investigating','identified','monitoring'])},order:{startedAt:'DESC'}}),this.db.getRepository(SystemComponentEntity).find({order:{name:'ASC'}})]);
    const components=[{key:'api',name:'API',status:'healthy',statusLabel:'Healthy'},{key:'database',name:'Database',status:database,statusLabel:database==='healthy'?'Healthy':'Critical'},...configured.map(c=>({key:c.key,name:c.name,status:c.status,statusLabel:c.status.charAt(0).toUpperCase()+c.status.slice(1),metadata:c.metadata,checkedAt:c.checkedAt}))];
    return {dateRangeLabel:'Current',updatedLabel:'Updated just now',kpis:[{key:'databaseLatency',label:'Database probe',value:`${Date.now()-started}ms`,trendLabel:'Live probe',tone:database==='healthy'?'green':'red',accent:database==='healthy'?'#0b6f31':'#b42318'}],latencyTrend:[],latencySummary:{p50:'N/A',p95:'N/A',availability:database==='healthy'?'100%':'0%'},errorBreakdown:{totalLabel:'0',totalSub:'No telemetry provider configured',segments:[]},components,appStability:[],activeIncidents:incidents.map(i=>({id:i.id,severity:i.severity,component:i.component,status:i.status,since:age(i.startedAt)})),bottomKpis:[]};
  }
  async createIncident(u:RequestContext,dto:CreateIncidentDto){const r=this.db.getRepository(SystemIncidentEntity);return r.save(r.create(this.audit(u,{...dto,status:'investigating',startedAt:new Date()})));}
  async updateIncident(u:RequestContext,id:string,dto:UpdateIncidentDto){const r=this.db.getRepository(SystemIncidentEntity),row=await r.findOneBy({id});if(!row)throw new DomainError('Incident was not found','INCIDENT_NOT_FOUND',404);row.status=dto.status;row.updatedById=u.userId;if(dto.status==='resolved')row.resolvedAt=new Date();return r.save(row);}

  async beginMfa(u:RequestContext){const users=this.db.getRepository(UserEntity),user=await users.findOneBy({id:u.userId,organizationId:u.organizationId});if(!user)throw new DomainError('User was not found','USER_NOT_FOUND',404);const repo=this.db.getRepository(UserMfaFactorEntity);await repo.update({userId:u.userId,status:'pending'},{status:'superseded',updatedById:u.userId});const secret=base32Encode(randomBytes(20));const recoveryCodes=Array.from({length:8},()=>randomBytes(5).toString('hex').toUpperCase());const row=await repo.save(repo.create(this.audit(u,{userId:u.userId,organizationId:u.organizationId,status:'pending',encryptedSecret:this.encrypt(secret),recoveryCodeHashes:recoveryCodes.map(c=>createHash('sha256').update(c).digest('hex'))})));return {factorId:row.id,secret,otpauthUrl:`otpauth://totp/${encodeURIComponent('goVerifEye:'+user.email)}?secret=${secret}&issuer=goVerifEye&digits=6&period=30`,recoveryCodes};}
  async verifyMfa(u:RequestContext,code:string){const repo=this.db.getRepository(UserMfaFactorEntity),row=await repo.findOne({where:{userId:u.userId,status:'pending'},order:{createdAt:'DESC'}});if(!row)throw new DomainError('MFA enrollment was not found','MFA_ENROLLMENT_NOT_FOUND',404);const secret=this.decrypt(row.encryptedSecret),step=Math.floor(Date.now()/30000);if(![-1,0,1].some(d=>totp(secret,step+d)===code)){row.failedAttempts++;row.updatedById=u.userId;await repo.save(row);throw new DomainError('The verification code is invalid','MFA_CODE_INVALID',400);}Object.assign(row,{status:'active',verifiedAt:new Date(),lastUsedAt:new Date(),failedAttempts:0,updatedById:u.userId});await repo.save(row);return {enabled:true,factorId:row.id};}
  async disableMfa(u:RequestContext,code:string,password:string){const users=this.db.getRepository(UserEntity),user=await users.findOneBy({id:u.userId,organizationId:u.organizationId});if(!user||!await argon2.verify(user.passwordHash,password))throw new DomainError('Password is invalid','PASSWORD_INVALID',400);const repo=this.db.getRepository(UserMfaFactorEntity),row=await repo.findOne({where:{userId:u.userId,status:'active'},order:{createdAt:'DESC'}});if(!row)throw new DomainError('MFA is not enabled','MFA_NOT_ENABLED',409);const secret=this.decrypt(row.encryptedSecret),step=Math.floor(Date.now()/30000);if(![-1,0,1].some(d=>totp(secret,step+d)===code))throw new DomainError('The verification code is invalid','MFA_CODE_INVALID',400);row.status='disabled';row.updatedById=u.userId;await repo.save(row);return {enabled:false};}

  async beginLoginMfa(user:UserEntity,rememberMe:boolean){const factor=await this.db.getRepository(UserMfaFactorEntity).findOne({where:{userId:user.id,status:'active'},order:{createdAt:'DESC'}});if(!factor)return null;const repo=this.db.getRepository(MfaLoginChallengeEntity);const row=await repo.save(repo.create({userId:user.id,organizationId:user.organizationId,rememberMe,consumed:false,attempts:0,expiresAt:new Date(Date.now()+5*60000),createdById:user.id,updatedById:user.id}));return {requiresTwoFactor:true,challengeId:row.id,email:user.email,expiresInSeconds:300};}
  async completeLoginMfa(challengeId:string,code:string){return this.db.transaction(async manager=>{const challenges=manager.getRepository(MfaLoginChallengeEntity),row=await challenges.findOne({where:{id:challengeId,consumed:false},lock:{mode:'pessimistic_write'}});if(!row||row.expiresAt.getTime()<=Date.now()||row.attempts>=5)throw new DomainError('MFA challenge is invalid or expired','MFA_CHALLENGE_INVALID',401);row.attempts++;row.updatedById=row.userId;const factor=await manager.getRepository(UserMfaFactorEntity).findOne({where:{userId:row.userId,status:'active'},order:{createdAt:'DESC'}});if(!factor)throw new DomainError('MFA factor is unavailable','MFA_FACTOR_NOT_FOUND',401);const secret=this.decrypt(factor.encryptedSecret),step=Math.floor(Date.now()/30000);if(![-1,0,1].some(d=>totp(secret,step+d)===code)){await challenges.save(row);throw new DomainError('MFA code is invalid','MFA_CODE_INVALID',401);}row.consumed=true;factor.lastUsedAt=new Date();factor.updatedById=row.userId;await Promise.all([challenges.save(row),manager.getRepository(UserMfaFactorEntity).save(factor)]);return {userId:row.userId,organizationId:row.organizationId,rememberMe:row.rememberMe};});}

  async auditCsv(limit:number,platform=false){const rows=await this.db.getRepository(AuditLogEntity).find({order:{createdAt:'DESC'},take:limit});return csv(['timestamp','actor','organization','action','resourceType','resourceId','status','correlationId'],rows.map(r=>[r.createdAt,r.actorId,r.organizationId,r.action,r.resourceType,r.resourceId,r.status,r.correlationId]));}
  async productsCsv(limit:number){const page=await this.listProducts(Object.assign(new PlatformProductQueryDto(),{page:1,pageSize:Math.min(limit,100)}));return csv(['id','name','vendor','status','codes','scans','updatedAt'],page.data.map((p:any)=>[p.id,p.name,p.vendor,p.status,p.codes,p.scans,p.updatedAt]));}
  async writeAudit(u:RequestContext,action:string,resourceType:string,resourceId:string,metadata?:Record<string,unknown>){return this.db.getRepository(AuditLogEntity).save({organizationId:u.organizationId,actorId:u.userId,action,resourceType,resourceId,status:'success',metadata});}
}
