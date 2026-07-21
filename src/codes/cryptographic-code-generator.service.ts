import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import codeGenerationConfig from '../config/code-generation.config';

export interface GeneratedCodePair { verificationCode: string; activationCode: string; activationCodeHash: string }

@Injectable()
export class CryptographicCodeGenerator {
  constructor(@Inject(codeGenerationConfig.KEY) private readonly options: ConfigType<typeof codeGenerationConfig>) {}

  generatePair(): GeneratedCodePair {
    const verificationCode = this.numericCode(this.options.verificationCodeLength);
    const activationCode = this.numericCode(this.options.activationCodeLength);
    return { verificationCode, activationCode, activationCodeHash: this.hashActivationCode(verificationCode, activationCode) };
  }

  matchesActivationCode(verificationCode: string, candidate: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashActivationCode(verificationCode, candidate), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private numericCode(length: number): string {
    let value = '';
    while (value.length < length) {
      const size = Math.min(8, length - value.length);
      value += randomInt(0, 10 ** size).toString().padStart(size, '0');
    }
    return value;
  }

  private hashActivationCode(verificationCode: string, activationCode: string): string {
    return createHmac('sha256', this.options.activationPepper).update(`${verificationCode}:${activationCode}`, 'utf8').digest('hex');
  }
}
