import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import codeGenerationConfig from '../config/code-generation.config';
import { DomainError } from '../common/domain-error';
import { ScanSessionEntity } from './code.entity';
export const SCAN_COOKIE_NAME='gve_scanner';

@Injectable()
export class ScanIdentityService {
  constructor(private readonly db:DataSource,@Inject(codeGenerationConfig.KEY)private readonly options:ConfigType<typeof codeGenerationConfig>){}
  private hash(label:string,value:string){const legacy=this.options as typeof this.options&{activationPepper?:string},key=process.env.SCAN_IDENTITY_SECRET??this.options.masterKey??legacy.activationPepper;if(!key)throw new Error('Scan identity secret is required');return createHmac('sha256',key).update(`${label}:${value}`).digest('hex')}
  private signature(token:string){return this.hash('scan-cookie',token)}
  private signed(token:string){return `${token}.${this.signature(token)}`}
  private token(cookie?:string){if(!cookie)return;const split=cookie.lastIndexOf('.');if(split<1)return;const token=cookie.slice(0,split),signature=cookie.slice(split+1);if(!/^[a-f0-9]{64}$/.test(signature))return;const provided=Buffer.from(signature,'hex'),expected=Buffer.from(this.signature(token),'hex');if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return;return token}
  anonymousHash(value?:string){return value?this.hash('scan-signal',value):undefined}
  async begin(cookie:string|undefined,ip?:string,userAgent?:string){
    const existingToken=this.token(cookie),now=new Date(),sessions=this.db.getRepository(ScanSessionEntity);
    let session=existingToken?await sessions.findOneBy({scannerHash:this.hash('scanner',existingToken)}):null;
    const scannerToken=session&&session.expiresAt>now?existingToken!:randomBytes(32).toString('base64url'),nonce=randomBytes(24).toString('base64url');
    session=await sessions.save(sessions.create({...session,scannerHash:this.hash('scanner',scannerToken),nonceHash:this.hash('scan-nonce',nonce),nonceExpiresAt:new Date(Date.now()+5*60_000),expiresAt:new Date(Date.now()+30*86400_000),lastSeenAt:now,ipHash:this.anonymousHash(ip),userAgentHash:this.anonymousHash(userAgent)}));
    return{cookieValue:this.signed(scannerToken),nonce,nonceExpiresInSeconds:300,sessionExpiresInSeconds:30*86400};
  }
  async consume(manager:EntityManager,cookie?:string,nonce?:string){
    const scannerToken=this.token(cookie);if(!scannerToken)return{};
    if(!nonce)throw new DomainError('A scan nonce is required for this browser session','SCAN_NONCE_REQUIRED',400);
    const scannerHash=this.hash('scanner',scannerToken),repo=manager.getRepository(ScanSessionEntity),session=await repo.findOne({where:{scannerHash},lock:{mode:'pessimistic_write'}}),now=new Date(),provided=Buffer.from(this.hash('scan-nonce',nonce),'hex'),expected=session?Buffer.from(session.nonceHash,'hex'):Buffer.alloc(0);
    if(!session||session.expiresAt<=now||session.nonceExpiresAt<=now||provided.length!==expected.length||!timingSafeEqual(provided,expected))throw new DomainError('The scan nonce is invalid, expired, or already used','SCAN_NONCE_INVALID',400);
    const nextNonce=randomBytes(24).toString('base64url');session.nonceHash=this.hash('scan-nonce',nextNonce);session.nonceExpiresAt=new Date(Date.now()+5*60_000);session.lastSeenAt=now;await repo.save(session);
    return{scannerHash,nextNonce,nonceExpiresInSeconds:300};
  }
}
