import { Injectable } from '@nestjs/common'; import { DataSource, ILike } from 'typeorm'; import * as argon2 from 'argon2';
import { pageOf } from '../common/api-response'; import { toOrder } from '../common/page-query.dto'; import { DomainError } from '../common/domain-error'; import { RequestContext } from '../common/request-context'; import { UserEntity } from '../auth/auth.entity'; import { UserRole } from '../auth/authorization'; import { OrganizationDocumentEntity, OrganizationEntity } from '../onboarding/onboarding.entity';
import { ApprovalDecisionEntity } from '../approvals/approval.entity';
import { AuditLogEntity, NotificationEntity } from './operations.entity'; import { AuditQueryDto, AuditSummaryQueryDto, ChangePasswordDto, NotificationQueryDto, UpdateCompanyDto, UpdateProfileDto } from './operations.dto'; import { applyAuditListFilters, mapAuditRowMetadata } from './audit-query.util';
@Injectable() export class OperationsService {
  constructor(private readonly db:DataSource) {}
  async audit(organizationId:string, actorId:string, action:string, resourceType:string, resourceId?:string, metadata?:Record<string,unknown>) { return this.db.getRepository(AuditLogEntity).save({ organizationId,actorId,action,resourceType,resourceId,metadata,status:'success' }); }
  async listAudit(organizationId:string,q:AuditQueryDto){
    const qb=this.db.getRepository(AuditLogEntity).createQueryBuilder('audit').leftJoin(UserEntity,'actor','actor.id = audit.actorId AND actor.organizationId = audit.organizationId').addSelect(['actor.firstName','actor.lastName','actor.email','actor.profileImageUrl']).where('audit.organizationId = :organizationId',{organizationId});
    // Sheet2 #58/59 — date/time, users, modules, actions, status (+ search).
    applyAuditListFilters(qb,q);
    const sort=new Set(['createdAt','action','resourceType','status']).has(q.sortBy)?q.sortBy:'createdAt';qb.orderBy(`audit.${sort}`,q.sortDirection.toUpperCase()as'ASC'|'DESC').addOrderBy('audit.id',q.sortDirection.toUpperCase()as'ASC'|'DESC');
    const total=await qb.clone().getCount(),{entities,raw}=await qb.skip((q.page-1)*q.pageSize).take(q.pageSize).getRawAndEntities();
    const data=entities.map((row,index)=>{
      const meta=mapAuditRowMetadata(row);
      return {...row,actor:{firstName:raw[index]?.actor_firstName??'',lastName:raw[index]?.actor_lastName??'',email:raw[index]?.actor_email??'',profileImageUrl:raw[index]?.actor_profileImageUrl??undefined},...meta};
    });
    return{...pageOf(data,total,q.page,q.pageSize,q.sortBy,q.sortDirection),data};
  }
  async auditSummary(organizationId:string,q:AuditSummaryQueryDto){
    const now=q.to?new Date(q.to):new Date(),defaultDays=q.range==='monthly'?365:q.range==='weekly'?56:30,from=q.from?new Date(q.from):new Date(now.getTime()-defaultDays*86400000);
    const rows=await this.db.getRepository(AuditLogEntity).createQueryBuilder('audit').select(['audit.createdAt','audit.actorId','audit.action','audit.resourceType','audit.status']).where('audit.organizationId = :organizationId',{organizationId}).andWhere('audit.createdAt BETWEEN :from AND :to',{from,to:now}).getMany();
    const totalActivities=await this.db.getRepository(AuditLogEntity).countBy({organizationId}),actorCounts=new Map<string,number>();for(const row of rows)actorCounts.set(row.actorId,(actorCounts.get(row.actorId)??0)+1);
    const mostId=[...actorCounts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0],most=mostId?await this.db.getRepository(UserEntity).findOneBy({id:mostId,organizationId}):null;
    const count=q.range==='monthly'?12:q.range==='weekly'?8:7,labels:string[]=[],trend:number[]=[];for(let i=count-1;i>=0;i--){const start=new Date(now);if(q.range==='monthly'){start.setUTCMonth(start.getUTCMonth()-i,1);start.setUTCHours(0,0,0,0)}else{start.setUTCDate(start.getUTCDate()-i*(q.range==='weekly'?7:1));start.setUTCHours(0,0,0,0)}const end=new Date(start);if(q.range==='monthly')end.setUTCMonth(end.getUTCMonth()+1);else end.setUTCDate(end.getUTCDate()+(q.range==='weekly'?7:1));labels.push(q.range==='monthly'?start.toLocaleString('en',{month:'short'}):q.range==='weekly'?`W${count-i}`:start.toLocaleString('en',{weekday:'short'}));trend.push(rows.filter(row=>row.createdAt>=start&&row.createdAt<end).length)}
    const heatmap=Array.from({length:7},()=>Array(24).fill(0)as number[]);for(const row of rows){const day=(row.createdAt.getUTCDay()+6)%7;heatmap[day]![row.createdAt.getUTCHours()]!++}const max=Math.max(1,...heatmap.flat());const levels=heatmap.map(day=>day.map(value=>Math.min(6,Math.ceil(value/max*6))));
    return{totalActivities,averageLogsPerDay:Number((rows.length/Math.max(1,Math.ceil((now.getTime()-from.getTime())/86400000))).toFixed(1)),activeUsers:actorCounts.size,mostActiveUser:most?`${most.firstName} ${most.lastName}`.trim()||most.email:'—',trend:{labels,values:trend},heatmap:levels,filters:{users:await this.db.getRepository(UserEntity).find({where:{organizationId},select:{id:true,firstName:true,lastName:true,email:true}}),modules:[...new Set(rows.map(row=>row.resourceType))].sort(),actions:[...new Set(rows.map(row=>row.action))].sort(),statuses:[...new Set(rows.map(row=>row.status))].sort()}};
  }
  async listNotifications(organizationId:string,userId:string,q:NotificationQueryDto){ const repo=this.db.getRepository(NotificationEntity); const where={organizationId,userId,...(q.read!==undefined?{isRead:q.read}:{}),...(q.type?{type:q.type}:{}),...(q.search?{title:ILike(`%${q.search}%`)}:{})}; const order=toOrder(q.sortBy,q.sortDirection,['createdAt','type','title','isRead'] as const,'createdAt'); const [data,total]=await repo.findAndCount({where,order,skip:(q.page-1)*q.pageSize,take:q.pageSize}); return pageOf(data,total,q.page,q.pageSize,q.sortBy,q.sortDirection); }
  async markRead(organizationId:string,userId:string,id:string){ const repo=this.db.getRepository(NotificationEntity); const item=await repo.findOneBy({id,organizationId,userId}); if(!item) throw new DomainError('Notification was not found','NOTIFICATION_NOT_FOUND',404); item.isRead=true; item.readAt=new Date(); return repo.save(item); }
  async readAll(organizationId:string,userId:string){ await this.db.getRepository(NotificationEntity).update({organizationId,userId,isRead:false},{isRead:true,readAt:new Date()}); return {updated:true}; }
  async deleteNotification(organizationId:string,userId:string,id:string){ const result=await this.db.getRepository(NotificationEntity).delete({id,organizationId,userId}); if(!result.affected) throw new DomainError('Notification was not found','NOTIFICATION_NOT_FOUND',404); return {deleted:true}; }
  async profile(organizationId:string,userId:string){ const user=await this.db.getRepository(UserEntity).findOneBy({id:userId,organizationId}); if(!user) throw new DomainError('Profile was not found','PROFILE_NOT_FOUND',404); const {passwordHash,...safe}=user; return safe; }
  async updateProfile(organizationId:string,userId:string,dto:UpdateProfileDto){ const repo=this.db.getRepository(UserEntity); const user=await repo.findOneBy({id:userId,organizationId}); if(!user) throw new DomainError('Profile was not found','PROFILE_NOT_FOUND',404); Object.assign(user,dto); const saved=await repo.save(user); const {passwordHash,...safe}=saved; return safe; }
  /**
   * Company profile plus durable milestone timestamps for Vendor Profile history.
   * Prefer approval_decisions / verified documents over org.updatedAt (which drifts on edits).
   */
  async company(organizationId:string){
    const row=await this.db.getRepository(OrganizationEntity).findOneBy({id:organizationId});
    if(!row) throw new DomainError('Company was not found','COMPANY_NOT_FOUND',404);
    const [decision, firstVerifiedDoc] = await Promise.all([
      this.db.getRepository(ApprovalDecisionEntity).findOne({
        where: { organizationId, resourceType: 'onboarding' },
        order: { createdAt: 'DESC' },
      }),
      this.db.getRepository(OrganizationDocumentEntity).findOne({
        where: { organizationId, status: 'verified' },
        order: { updatedAt: 'ASC' },
      }),
    ]);
    const documentsAcceptedAt =
      firstVerifiedDoc?.updatedAt ?? firstVerifiedDoc?.createdAt ?? null;
    const reviewedAt =
      decision?.createdAt ??
      ((row.status === 'approved' ||
        row.status === 'rejected' ||
        row.status === 'verified')
        ? row.updatedAt
        : null);
    return {
      ...row,
      joinedAt: row.createdAt,
      documentsAcceptedAt,
      reviewedAt,
      reviewDecision: decision?.decision ?? null,
    };
  }
  async updateCompany(u:RequestContext,dto:UpdateCompanyDto){
    // Sheet1 #3 — Vendor Staff may view company account but must not edit it.
    if(u.role!==UserRole.VendorAdmin&&u.role!=='vendor_admin')throw new DomainError('Only a Vendor Admin can update company account details','COMPANY_UPDATE_FORBIDDEN',403);
    const repo=this.db.getRepository(OrganizationEntity); const row=await repo.findOneBy({id:u.organizationId}); if(!row) throw new DomainError('Company was not found','COMPANY_NOT_FOUND',404);
    const{contactEmail,contactPhone,...company}=dto;Object.assign(row,company);if(contactEmail!==undefined||contactPhone!==undefined)row.administrator={...row.administrator,...(contactEmail!==undefined?{email:contactEmail}:{}),...(contactPhone!==undefined?{phone:contactPhone}:{})};return repo.save(row);
  }
  async changePassword(organizationId:string,userId:string,dto:ChangePasswordDto){ const repo=this.db.getRepository(UserEntity); const user=await repo.findOneBy({id:userId,organizationId,isActive:true}); if(!user||!await argon2.verify(user.passwordHash,dto.currentPassword)) throw new DomainError('Current password is incorrect','INVALID_PASSWORD',401); user.passwordHash=await argon2.hash(dto.newPassword,{type:argon2.argon2id}); user.mustChangePassword=false; await repo.save(user); await this.audit(organizationId,userId,'password.changed','user',userId); return {changed:true}; }
  async deactivate(organizationId:string,userId:string){ return this.db.transaction(async manager=>{const repo=manager.getRepository(UserEntity);const user=await repo.findOneBy({id:userId,organizationId});if(!user)throw new DomainError('Profile was not found','PROFILE_NOT_FOUND',404);if(user.role==='vendor_admin'&&await repo.countBy({organizationId,role:'vendor_admin',isActive:true})<=1)throw new DomainError('The final active administrator cannot deactivate their account','FINAL_ADMIN_REQUIRED',409);user.isActive=false;await repo.save(user);await manager.getRepository(AuditLogEntity).save({organizationId,actorId:userId,action:'account.deactivated',resourceType:'user',resourceId:userId,status:'success'});await manager.getRepository(UserEntity);return{deactivated:true}}); }
}
