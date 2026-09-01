import { Injectable } from '@nestjs/common';
import { Brackets, DataSource, EntityManager, ILike } from 'typeorm';
import { pageOf } from '../common/api-response';
import { DomainError } from '../common/domain-error';
import { RequestContext } from '../common/request-context';
import { toOrder } from '../common/page-query.dto';
import { EmailContent } from './email-templates';
import { ActivateEmailTemplateDto, CreateEmailTemplateDto, EmailTemplateQueryDto, PreviewEmailTemplateDto, UpdateEmailTemplateDto } from './email-template.dto';
import { EmailTemplateEntity, EmailTemplateHistoryEntity } from './email-template.entity';

const TOKEN = /{{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*}}/g;
function htmlEscape(value: unknown) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function tokens(input:string){return [...input.matchAll(TOKEN)].map((m)=>m[1]!);}

@Injectable()
export class EmailTemplateService {
  constructor(private readonly db:DataSource){}

  async render(manager:EntityManager,key:string,variables:Record<string,unknown>,fallback:()=>EmailContent):Promise<EmailContent>{
    const row=await manager.getRepository(EmailTemplateEntity).findOne({where:{key,status:'active'},order:{versionNumber:'DESC'}});
    if(!row)return fallback();
    return this.renderRow(row,variables);
  }
  renderRow(row:Pick<EmailTemplateEntity,'subjectTemplate'|'textTemplate'|'htmlTemplate'|'requiredVariables'>,variables:Record<string,unknown>):EmailContent{
    const missing=row.requiredVariables.filter((key)=>variables[key]===undefined||variables[key]===null);
    if(missing.length)throw new DomainError(`Missing email template variables: ${missing.join(', ')}`,'EMAIL_TEMPLATE_VARIABLES_MISSING',500);
    const plain=(input:string)=>input.replace(TOKEN,(_,key:string)=>String(variables[key]??''));
    const html=(input:string)=>input.replace(TOKEN,(_,key:string)=>htmlEscape(variables[key]));
    return {subject:plain(row.subjectTemplate).replace(/[\r\n]+/g,' ').slice(0,300),text:plain(row.textTemplate),html:html(row.htmlTemplate)};
  }
  private validate(dto:{subjectTemplate:string;textTemplate:string;htmlTemplate:string;requiredVariables:string[]}){
    if(/<script\b|\son\w+\s*=|javascript\s*:/i.test(dto.htmlTemplate))throw new DomainError('Email HTML contains unsafe executable content','EMAIL_TEMPLATE_HTML_UNSAFE',400);
    if(dto.subjectTemplate.includes('{{{')||dto.textTemplate.includes('{{{')||dto.htmlTemplate.includes('{{{'))throw new DomainError('Triple-brace/raw substitutions are not supported','EMAIL_TEMPLATE_SYNTAX_INVALID',400);
    const used=new Set([...tokens(dto.subjectTemplate),...tokens(dto.textTemplate),...tokens(dto.htmlTemplate)]),declared=new Set(dto.requiredVariables);
    const undeclared=[...used].filter((key)=>!declared.has(key)),unused=[...declared].filter((key)=>!used.has(key));
    if(undeclared.length||unused.length)throw new DomainError(`Template variable declaration mismatch${undeclared.length?`; undeclared: ${undeclared.join(', ')}`:''}${unused.length?`; unused: ${unused.join(', ')}`:''}`,'EMAIL_TEMPLATE_VARIABLES_INVALID',400);
  }
  async list(q:EmailTemplateQueryDto){const repo=this.db.getRepository(EmailTemplateEntity),qb=repo.createQueryBuilder('t').where('t.deletedAt IS NULL');if(q.key)qb.andWhere('t.key = :key',{key:q.key});if(q.audience)qb.andWhere('t.audience = :audience',{audience:q.audience});if(q.status)qb.andWhere('t.status = :status',{status:q.status});if(q.search)qb.andWhere(new Brackets((x)=>x.where('t.name ILIKE :s').orWhere('t.key ILIKE :s')),{s:`%${q.search}%`});qb.orderBy(`t.${q.sortBy}`,q.sortDirection.toUpperCase()as'ASC'|'DESC').addOrderBy('t.versionNumber','DESC').skip((q.page-1)*q.pageSize).take(q.pageSize);const[rows,total]=await qb.getManyAndCount();return pageOf(rows,total,q.page,q.pageSize,q.sortBy,q.sortDirection);}
  async get(id:string){const row=await this.db.getRepository(EmailTemplateEntity).findOneBy({id});if(!row)throw new DomainError('Email template was not found','EMAIL_TEMPLATE_NOT_FOUND',404);return row;}
  async create(u:RequestContext,dto:CreateEmailTemplateDto){this.validate(dto);const repo=this.db.getRepository(EmailTemplateEntity);if(await repo.existsBy({key:dto.key,versionNumber:1}))throw new DomainError('Email template key already exists','EMAIL_TEMPLATE_EXISTS',409);const row=await repo.save(repo.create({...dto,status:'draft',versionNumber:1,isSystem:false,createdById:u.userId,updatedById:u.userId}));await this.history(u,row,'create',dto.reason);return row;}
  async revise(u:RequestContext,id:string,dto:UpdateEmailTemplateDto){const source=await this.get(id),merged={...source,...dto,requiredVariables:dto.requiredVariables??source.requiredVariables};this.validate(merged);const repo=this.db.getRepository(EmailTemplateEntity),latest=await repo.createQueryBuilder('t').select('MAX(t.versionNumber)','version').where('t.key = :key',{key:source.key}).getRawOne<{version:string}>();const row=await repo.save(repo.create({key:source.key,name:dto.name??source.name,audience:source.audience,status:'draft',versionNumber:Number(latest?.version??0)+1,subjectTemplate:dto.subjectTemplate??source.subjectTemplate,textTemplate:dto.textTemplate??source.textTemplate,htmlTemplate:dto.htmlTemplate??source.htmlTemplate,requiredVariables:dto.requiredVariables??source.requiredVariables,description:dto.description??source.description,isSystem:source.isSystem,createdById:u.userId,updatedById:u.userId}));await this.history(u,row,'revise',dto.reason);return row;}
  async activate(u:RequestContext,id:string,dto:ActivateEmailTemplateDto){return this.db.transaction(async(manager)=>{const repo=manager.getRepository(EmailTemplateEntity),row=await repo.findOne({where:{id},lock:{mode:'pessimistic_write'}});if(!row)throw new DomainError('Email template was not found','EMAIL_TEMPLATE_NOT_FOUND',404);this.validate(row);await repo.createQueryBuilder().update().set({status:'archived',updatedById:u.userId}).where('key = :key AND status = :status AND id <> :id',{key:row.key,status:'active',id:row.id}).execute();Object.assign(row,{status:'active',activatedAt:new Date(),activatedById:u.userId,updatedById:u.userId});const saved=await repo.save(row);await this.history(u,saved,'activate',dto.reason,manager);return saved;});}
  async preview(id:string,dto:PreviewEmailTemplateDto){return this.renderRow(await this.get(id),dto.variables);}
  historyList(id:string){return this.db.getRepository(EmailTemplateHistoryEntity).find({where:{templateId:id},order:{createdAt:'DESC'}});}
  private async history(u:RequestContext,row:EmailTemplateEntity,action:string,reason:string,manager:EntityManager=this.db.manager){const snapshot={key:row.key,name:row.name,audience:row.audience,status:row.status,versionNumber:row.versionNumber,subjectTemplate:row.subjectTemplate,textTemplate:row.textTemplate,htmlTemplate:row.htmlTemplate,requiredVariables:row.requiredVariables,description:row.description};const repo=manager.getRepository(EmailTemplateHistoryEntity);await repo.save(repo.create({templateId:row.id,key:row.key,action,snapshot,reason,createdById:u.userId,updatedById:u.userId}));}
}
