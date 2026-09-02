import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import codeGenerationConfig from '../config/code-generation.config';

export interface GeneratedCodePair { verificationCode: string; activationCode: string; activationCodeHash: string }

@Injectable()
export class CryptographicCodeGenerator {
  constructor(@Inject(codeGenerationConfig.KEY) private readonly options: ConfigType<typeof codeGenerationConfig>) {}

  generatePair(verificationCodeLength = this.options.verificationCodeLength): GeneratedCodePair {
    const verificationCode = this.numericCode(verificationCodeLength);
    const activationCode = this.numericCode(this.options.activationCodeLength);
    return { verificationCode, activationCode, activationCodeHash: this.hashActivationCode(verificationCode, activationCode) };
  }

  matchesActivationCode(verificationCode: string, candidate: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashActivationCode(verificationCode, candidate), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private numericCode(length: number): string {
    for (;;) {
      let value = '';
      while (value.length < length) {
        const size = Math.min(8, length - value.length);
        value += randomInt(0, 10 ** size).toString().padStart(size, '0');
      }
      if (this.isAllowedNumericCode(value)) return value;
    }
  }

  private isAllowedNumericCode(value: string): boolean {
    if (value.startsWith('000')) return false;
    if (/^(\d)\1+$/.test(value)) return false;
    if (/(\d)\1{3,}/.test(value)) return false;

    for (let start = 0; start <= value.length - 6; start += 1) {
      const digits = value.slice(start, start + 6).split('').map(Number);
      const ascending = digits.every((digit, index) => index === 0 || digit === (digits[index - 1]! + 1) % 10);
      const descending = digits.every((digit, index) => index === 0 || digit === (digits[index - 1]! + 9) % 10);
      if (ascending || descending) return false;
    }
    return true;
  }

  private hashActivationCode(verificationCode: string, activationCode: string): string {
    return createHmac('sha256', this.options.activationPepper).update(`${verificationCode}:${activationCode}`, 'utf8').digest('hex');
  }
}
