import {
  ensureStorageBuckets,
  requiredStorageBuckets,
} from './storage-bootstrap.service';

describe('Supabase storage startup checks', () => {
  it('uses the configured names and expected access modes', () => {
    expect(
      requiredStorageBuckets({
        SUPABASE_PRODUCT_IMAGES_BUCKET: 'products',
        SUPABASE_PROFILE_IMAGES_BUCKET: 'profiles',
        SUPABASE_STORAGE_BUCKET: 'documents',
        SUPABASE_ARTIFACT_BUCKET: 'artifacts',
      }),
    ).toEqual([
      { name: 'products', isPublic: true },
      { name: 'profiles', isPublic: true },
      { name: 'documents', isPublic: false },
      { name: 'artifacts', isPublic: false },
    ]);
  });

  it('creates missing buckets and leaves existing buckets unchanged', async () => {
    const storage = {
      listBuckets: jest.fn().mockResolvedValue({
        data: [{ name: 'product-images', public: true }],
        error: null,
      }),
      createBucket: jest.fn().mockResolvedValue({ error: null }),
    };

    await ensureStorageBuckets(storage, [
      { name: 'product-images', isPublic: true },
      { name: 'compliance-documents', isPublic: false },
    ]);

    expect(storage.createBucket).toHaveBeenCalledTimes(1);
    expect(storage.createBucket).toHaveBeenCalledWith('compliance-documents', {
      public: false,
    });
  });

  it('fails when an existing bucket has the wrong access mode', async () => {
    const storage = {
      listBuckets: jest.fn().mockResolvedValue({
        data: [{ name: 'product-images', public: false }],
        error: null,
      }),
      createBucket: jest.fn(),
    };

    await expect(
      ensureStorageBuckets(storage, [{ name: 'product-images', isPublic: true }]),
    ).rejects.toThrow('must be public, but it is private');
    expect(storage.createBucket).not.toHaveBeenCalled();
  });

  it('fails with the bucket name when creation is rejected', async () => {
    const storage = {
      listBuckets: jest.fn().mockResolvedValue({ data: [], error: null }),
      createBucket: jest.fn().mockResolvedValue({
        error: { message: 'not authorized' },
      }),
    };

    await expect(
      ensureStorageBuckets(storage, [{ name: 'product-images', isPublic: true }]),
    ).rejects.toThrow(
      'Could not create Supabase bucket "product-images": not authorized',
    );
  });
});
