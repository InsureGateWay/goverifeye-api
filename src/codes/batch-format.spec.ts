import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ActivateCodeBatchDto } from './batch-activation.dto';
import { batchLookup, canonicalBatchId, displayBatchReference, masterQrPayload, newBatchReference, newCodeBatchId, normalizeBatchReference } from './batch-format';
import { redactLogValue } from '../common/structured-logger.service';

describe('batch identifiers and activation inputs', () => {
  it('generates RFC 9562 UUIDv7 IDs with the current millisecond timestamp', () => {
    const start=Date.now(), ids=Array.from({length:1000},newCodeBatchId);
    expect(new Set(ids).size).toBe(ids.length);
    for(const id of ids){
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const timestamp=parseInt(id.replace(/-/g,'').slice(0,12),16);
      expect(timestamp).toBeGreaterThanOrEqual(start);expect(timestamp).toBeLessThanOrEqual(Date.now());
    }
  });
  it('uses one canonical Crockford reference across interfaces', () => {
    expect(normalizeBatchReference('cb-7k4m-9x2p-r6')).toBe('CB-7K4M9X2PR6');
    expect(displayBatchReference('CB-7K4M9X2PR6')).toBe('CB-7K4M-9X2P-R6');
    expect(batchLookup('CB-7K4M-9X2P-R6')).toEqual(batchLookup('CB-7K4M9X2PR6'));
    expect(newBatchReference()).toMatch(/^CB-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(batchLookup('B-260901-123')).toBeNull();expect(normalizeBatchReference('CB-OOOOOOOOOO')).toBeNull();
  });
  it('keeps internal IDs and credentials out of the Master QR', () => {
    const payload=JSON.parse(masterQrPayload({batchReference:'CB-7K4M9X2PR6',activationMode:'controlled_physical_print'}));
    expect(payload).toEqual({batchReference:'CB-7K4M9X2PR6',deploymentMode:'controlled_physical_print'});
    expect(()=>canonicalBatchId('CB-7K4M9X2PR6')).toThrow();
  });
  it('preserves PIN leading zeros and requires an explicit confirmation', () => {
    const dto=plainToInstance(ActivateCodeBatchDto,{confirm:true,productBatchReference:'LOT-1',pin:'0012 3456'});
    expect(dto.pin).toBe('00123456');expect(validateSync(dto)).toHaveLength(0);
    expect(validateSync(plainToInstance(ActivateCodeBatchDto,{...dto,pin:'123456'}))).not.toHaveLength(0);
    expect(validateSync(plainToInstance(ActivateCodeBatchDto,{...dto,confirm:false}))).not.toHaveLength(0);
  });
  it('redacts PINs, legacy credentials, and passwords in structured logs', () => {
    expect(redactLogValue({pin:'00123456',activationCode:'00123456',credential:'00123456',password:'Password123!'})).toEqual({pin:'[redacted]',activationCode:'[redacted]',credential:'[redacted]',password:'[redacted]'});
  });
});
