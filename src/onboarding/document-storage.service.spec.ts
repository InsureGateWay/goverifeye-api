import { storageErrorDetails } from './document-storage.service';

describe('storageErrorDetails', () => {
  it('extracts useful provider diagnostics without serializing arbitrary fields', () => {
    expect(storageErrorDetails({
      message: 'Bucket not found\r\n',
      statusCode: '404',
      token: 'must-not-be-logged',
    })).toEqual({ reason: 'Bucket not found', providerStatus: 404 });
  });

  it('handles non-object failures', () => {
    expect(storageErrorDetails('network unavailable')).toEqual({ reason: 'network unavailable' });
  });
});
