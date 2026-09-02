import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface RequiredStorageBucket {
  name: string;
  isPublic: boolean;
}

interface StorageBucketSummary {
  name: string;
  public: boolean;
}

interface StorageAdminClient {
  listBuckets(options?: { limit?: number; offset?: number }): Promise<{
    data: StorageBucketSummary[] | null;
    error: { message: string } | null;
  }>;
  createBucket(name: string, options: { public: boolean }): Promise<{
    error: { message: string } | null;
  }>;
}

export function requiredStorageBuckets(
  environment: NodeJS.ProcessEnv = process.env,
): RequiredStorageBucket[] {
  return [
    {
      name: environment.SUPABASE_PRODUCT_IMAGES_BUCKET ?? 'product-images',
      isPublic: true,
    },
    {
      name: environment.SUPABASE_PROFILE_IMAGES_BUCKET ?? 'profile-images',
      isPublic: true,
    },
    {
      name: environment.SUPABASE_STORAGE_BUCKET ?? 'compliance-documents',
      isPublic: false,
    },
    {
      name: environment.SUPABASE_ARTIFACT_BUCKET ?? 'generated-artifacts',
      isPublic: false,
    },
  ];
}

export async function ensureStorageBuckets(
  storage: StorageAdminClient,
  requiredBuckets: RequiredStorageBucket[],
  onCreated: (name: string) => void = () => undefined,
): Promise<void> {
  const requirements = new Map<string, boolean>();
  for (const bucket of requiredBuckets) {
    const existingRequirement = requirements.get(bucket.name);
    if (existingRequirement !== undefined && existingRequirement !== bucket.isPublic) {
      throw new Error(
        `Supabase bucket "${bucket.name}" is configured as both public and private`,
      );
    }
    requirements.set(bucket.name, bucket.isPublic);
  }

  const { data, error } = await storage.listBuckets({ limit: 100, offset: 0 });
  if (error) {
    throw new Error(`Could not list Supabase storage buckets: ${error.message}`);
  }

  const existingBuckets = new Map((data ?? []).map((bucket) => [bucket.name, bucket]));
  for (const [name, isPublic] of requirements) {
    const existing = existingBuckets.get(name);
    if (existing) {
      if (existing.public !== isPublic) {
        throw new Error(
          `Supabase bucket "${name}" must be ${isPublic ? 'public' : 'private'}, but it is ${existing.public ? 'public' : 'private'}`,
        );
      }
      continue;
    }

    const result = await storage.createBucket(name, { public: isPublic });
    if (result.error) {
      throw new Error(
        `Could not create Supabase bucket "${name}": ${result.error.message}`,
      );
    }
    onCreated(name);
  }
}

@Injectable()
export class StorageBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StorageBootstrapService.name);

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey || serviceRoleKey.startsWith('replace-')) {
      throw new Error(
        'Supabase storage startup check failed: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured',
      );
    }

    const client: SupabaseClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await ensureStorageBuckets(
      client.storage,
      requiredStorageBuckets(),
      (name) => this.logger.log(`Created required Supabase storage bucket "${name}"`),
    );
    this.logger.log('Required Supabase storage buckets are available');
  }
}
