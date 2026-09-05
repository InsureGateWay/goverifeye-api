import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import codeGenerationConfig from '../config/code-generation.config';

export const GVE16_FORMAT = 'GVE-16';

export interface GeneratedGve16Code {
  verificationCode: string;
  codeFormatVersion: string;
  keyVersion: string;
  namespace: string;
  internalSerial: string;
  publicToken: string;
  luhnDigit: string;
  antiFabTag: string;
  allocationId: string;
}

export interface Gve16Candidate {
  canonical: string;
  namespace: string;
  publicToken: string;
  luhnDigit: string;
  antiFabTag: string;
}

@Injectable()
export class CryptographicCodeGenerator {
  constructor(
    @Inject(codeGenerationConfig.KEY)
    private readonly options: ConfigType<typeof codeGenerationConfig>,
  ) { this.deriveKey('gve16:fpe',this.options.keyVersion);this.deriveKey('gve16:anti-fabrication',this.options.keyVersion); }

  generate(namespace: string, internalSerial: string | number | bigint, allocationId: string): GeneratedGve16Code {
    this.assertNamespace(namespace);
    const serial = BigInt(internalSerial);
    if (serial < 0n || serial > 9_999_999n) throw new Error('GVE-16 namespace serial capacity has been exceeded');
    const serialDigits = serial.toString().padStart(7, '0');
    const publicToken = this.encryptToken(namespace, serialDigits);
    const luhnDigit = this.luhnCheckDigit(namespace + publicToken);
    const antiFabTag = this.computeTag(namespace, publicToken, allocationId, this.options.formatVersion, this.options.keyVersion);
    return {
      verificationCode: namespace + publicToken + luhnDigit + antiFabTag,
      codeFormatVersion: this.options.formatVersion,
      keyVersion: this.options.keyVersion,
      namespace,
      internalSerial: serial.toString(),
      publicToken,
      luhnDigit,
      antiFabTag,
      allocationId,
    };
  }

  parseCandidate(value: string): Gve16Candidate | null {
    const canonical = String(value ?? '').replace(/\s/g, '');
    if (!/^\d{16}$/.test(canonical)) return null;
    return { canonical, namespace: canonical.slice(0, 4), publicToken: canonical.slice(4, 11), luhnDigit: canonical.slice(11, 12), antiFabTag: canonical.slice(12, 16) };
  }

  hasValidLuhn(candidate: Gve16Candidate): boolean {
    return this.luhnCheckDigit(candidate.namespace + candidate.publicToken) === candidate.luhnDigit;
  }

  hasValidTag(input: {namespace:string;publicToken:string;antiFabTag:string;allocationId:string;codeFormatVersion:string;keyVersion:string}): boolean {
    if (!this.options.keyRing[input.keyVersion]) return false;
    const actual = Buffer.from(this.computeTag(input.namespace, input.publicToken, input.allocationId, input.codeFormatVersion,input.keyVersion));
    const expected = Buffer.from(input.antiFabTag);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  encryptToken(namespace: string, serialDigits: string): string {
    this.assertNamespace(namespace);
    if (!/^\d{7}$/.test(serialDigits)) throw new Error('GVE-16 internal serial must contain seven digits');
    let left = serialDigits.slice(0, 3), right = serialDigits.slice(3);
    for (let round = 0; round < 10; round += 1) {
      const modulus = 10 ** left.length;
      const mixed = (Number(left) + this.roundValue(namespace, round, right, modulus)) % modulus;
      [left, right] = [right, String(mixed).padStart(left.length, '0')];
    }
    return left + right;
  }

  decryptToken(namespace: string, publicToken: string): string {
    this.assertNamespace(namespace);
    if (!/^\d{7}$/.test(publicToken)) throw new Error('GVE-16 public token must contain seven digits');
    let left = publicToken.slice(0, 3), right = publicToken.slice(3);
    for (let round = 9; round >= 0; round -= 1) {
      const previousRight = left, modulus = 10 ** right.length;
      const value = (Number(right) - this.roundValue(namespace, round, previousRight, modulus) + modulus) % modulus;
      [left, right] = [String(value).padStart(right.length, '0'), previousRight];
    }
    return left + right;
  }

  generateBatchCredential(): string {
    let value = '';
    while (value.length < this.options.activationCredentialLength) {
      const size = Math.min(8, this.options.activationCredentialLength - value.length);
      value += randomInt(0, 10 ** size).toString().padStart(size, '0');
    }
    return value;
  }

  private computeTag(namespace:string, publicToken:string, allocationContext:string, formatVersion:string,keyVersion:string): string {
    const format = Buffer.from(formatVersion, 'utf8'), allocation = Buffer.from(allocationContext, 'utf8');
    const formatLength = Buffer.alloc(2), allocationLength = Buffer.alloc(2);
    formatLength.writeUInt16BE(format.length); allocationLength.writeUInt16BE(allocation.length);
    const input = Buffer.concat([Buffer.from('GVE16','utf8'),formatLength,format,Buffer.from(namespace+publicToken,'ascii'),allocationLength,allocation]);
    const digest = createHmac('sha256', this.deriveKey('gve16:anti-fabrication',keyVersion)).update(input).digest();
    return (digest.readUInt32BE(0) % 10_000).toString().padStart(4, '0');
  }

  private luhnCheckDigit(payload:string): string {
    let sum=0,double=true;
    for(let index=payload.length-1;index>=0;index-=1){let digit=Number(payload[index]);if(double){digit*=2;if(digit>9)digit-=9;}sum+=digit;double=!double;}
    return String((10-(sum%10))%10);
  }

  private roundValue(namespace:string,round:number,right:string,modulus:number):number{
    const digest=createHmac('sha256',this.deriveKey('gve16:fpe',this.options.keyVersion)).update(`${this.options.keyVersion}|${namespace}|${round}|${right}`,'ascii').digest();
    return digest.readUInt32BE(0)%modulus;
  }

  private deriveKey(purpose:string,keyVersion:string):Buffer{
    const masterKey=this.options.keyRing[keyVersion];
    if(!masterKey||masterKey.length<32)throw new Error(`GVE code key version ${keyVersion} is unavailable or shorter than 32 characters`);
    return createHmac('sha256',masterKey).update(`${purpose}:v${keyVersion}`,'utf8').digest();
  }

  private assertNamespace(namespace:string):void{if(!/^\d{4}$/.test(namespace))throw new Error('GVE-16 namespace must contain four digits');}
}
