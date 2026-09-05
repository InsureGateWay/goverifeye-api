import { CryptographicCodeGenerator } from './cryptographic-code-generator.service';

describe('GVE-16 cryptographic code generator',()=>{
  const masterKey='independent-test-master-key-with-32-chars',options={formatVersion:'3.3.3',keyVersion:'test-v1',masterKey,keyRing:{'test-v1':masterKey},activationCredentialLength:8,activationMaxAttempts:5,maxCodesPerBatch:10_000};
  const service=new CryptographicCodeGenerator(options);

  it('generates the canonical namespace-token-Luhn-tag layout',()=>{
    const code=service.generate('4827',1,'11111111-1111-4111-8111-111111111111');
    expect(code.verificationCode).toBe('4827365951905296');
    expect(code.verificationCode).toMatch(/^4827\d{12}$/);
    expect(code.publicToken).toHaveLength(7);expect(code.luhnDigit).toHaveLength(1);expect(code.antiFabTag).toHaveLength(4);
    const parsed=service.parseCandidate(code.verificationCode);expect(parsed).not.toBeNull();expect(service.hasValidLuhn(parsed!)).toBe(true);
    expect(service.hasValidTag({...code,antiFabTag:parsed!.antiFabTag})).toBe(true);
  });

  it('is a reversible decimal permutation and hides serial progression',()=>{
    const tokens=Array.from({length:1000},(_,index)=>service.encryptToken('4827',String(index+1).padStart(7,'0')));
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens.slice(0,20)).not.toEqual([...tokens.slice(0,20)].sort());
    expect(service.decryptToken('4827',tokens[499]!)).toBe('0000500');
  });

  it('detects mistypes and an altered allocation context',()=>{
    const code=service.generate('4827',99,'11111111-1111-4111-8111-111111111111'),parsed=service.parseCandidate(code.verificationCode)!;
    const mistyped={...parsed,publicToken:`${parsed.publicToken.slice(0,6)}${(Number(parsed.publicToken[6])+1)%10}`};
    expect(service.hasValidLuhn(mistyped)).toBe(false);
    expect(service.hasValidTag({...code,allocationId:'22222222-2222-4222-8222-222222222222'})).toBe(false);
  });

  it('normalises display spaces but rejects non-GVE-16 lengths',()=>{
    const code=service.generate('4827',7,'11111111-1111-4111-8111-111111111111').verificationCode;
    const displayed=code.match(/.{1,4}/g)!.join(' ');
    expect(service.parseCandidate(displayed)?.canonical).toBe(code);
    expect(service.parseCandidate('12345678901234')).toBeNull();
  });

  it('creates one batch credential rather than per-label credentials',()=>{
    expect(service.generateBatchCredential()).toMatch(/^\d{8}$/);
  });

  it('verifies an existing tag after controlled key rotation',()=>{
    const old=service.generate('4827',15,'11111111-1111-4111-8111-111111111111');
    const nextKey='a-second-independent-master-key-32-chars',rotated=new CryptographicCodeGenerator({...options,keyVersion:'test-v2',masterKey:nextKey,keyRing:{'test-v1':masterKey,'test-v2':nextKey}});
    expect(rotated.hasValidTag(old)).toBe(true);
  });
});
