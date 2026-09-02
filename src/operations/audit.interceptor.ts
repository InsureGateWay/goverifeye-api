import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { DataSource } from 'typeorm';
import { RequestContext } from '../common/request-context';
import { AuditLogEntity } from './operations.entity';

type AuditedRequest = { method:string; url:string; originalUrl?:string; headers:Record<string,string|undefined>; ip?:string; user?:RequestContext; params?:Record<string,string> };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly db: DataSource) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request=context.switchToHttp().getRequest<AuditedRequest>();
    const path=(request.originalUrl??request.url).split('?')[0]??'',parts=path.split('/').filter(Boolean),resourceType=this.resourceType(parts),resourceId=this.resourceId(request.params);
    const sensitiveRead=request.method==='GET'&&(parts.includes('export')||parts.includes('download'));
    if(!request.user||(['GET','HEAD','OPTIONS'].includes(request.method)&&!sensitiveRead))return next.handle();
    const forwarded=request.headers['x-forwarded-for']?.split(',')[0]?.trim(),location=[request.headers['cf-ipcity'],request.headers['cf-region'],request.headers['cf-ipcountry']].filter(Boolean).join(', '),authority=request.user.role==='super_admin'?'Super Admin':request.user.role==='admin'?'Vendor Admin':'Vendor Staff';
    const write=(status:'success'|'failed')=>{void this.db.getRepository(AuditLogEntity).save({organizationId:request.user!.organizationId,actorId:request.user!.userId,action:`${request.method.toLowerCase()}.${resourceType}`,resourceType,resourceId,status,correlationId:request.headers['x-correlation-id'],metadata:{details:`${request.method.toUpperCase()} ${path}`,authority,ipAddress:forwarded||request.ip,location:location||undefined,userAgent:request.headers['user-agent'],device:request.headers['x-device-name'],deviceFingerprint:request.headers['x-device-fingerprint'],timezone:request.headers['x-client-timezone'],sessionId:request.user!.sessionId,vendorId:request.params?.vendorId}}).catch(()=>undefined)};
    return next.handle().pipe(tap(()=>write('success')),catchError(error=>{write('failed');return throwError(()=>error)}));
  }
  private resourceId(params:Record<string,string>={}){return params.productId??params.documentId??params.vendorId??params.batchId??params.codeId??params.id;}
  private resourceType(parts:string[]){if(parts.includes('products'))return'product';if(parts.includes('documents'))return'organization_document';if(parts.includes('vendors')||parts.includes('onboarding'))return'organization';if(parts.includes('options'))return'application_option';if(parts.includes('change-requests'))return'organization_change_request';if(parts.includes('fraud-alerts'))return'fraud_case';if(parts.includes('audit-exceptions'))return'audit_exception';if(parts.includes('incidents'))return'system_incident';if(parts.includes('team'))return'team_member';if(parts.includes('codes')||parts.includes('code-batches'))return'verification_code';return parts.find(part=>!['api','v1','platform'].includes(part)&&!part.match(/^[0-9a-f-]{20,}$/i))??'system';}
}
