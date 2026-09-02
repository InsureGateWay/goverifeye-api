import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '../common/domain-error';

type StorageError = { message?: string; statusCode?: string | number; error?: string };

export function storageErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') return { reason: String(error ?? 'Unknown storage error') };
  const value = error as StorageError;
  return {
    reason: String(value.message ?? value.error ?? 'Unknown storage error').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 500),
    ...(value.statusCode ? { providerStatus: Number(value.statusCode) || String(value.statusCode) } : {}),
  };
}

function safeStoragePath(path: string) {
  return path.replace(/\/[^/]+$/, '/[object]');
}

@Injectable()
export class DocumentStorageService {
  private readonly logger = new Logger(DocumentStorageService.name);
  private client?: SupabaseClient;

  private get bucket() {
    return process.env.SUPABASE_STORAGE_BUCKET ?? 'compliance-documents';
  }

  private get storage() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || key.startsWith('replace-')) throw new ServiceUnavailableException('Supabase Storage is not configured');
    return (this.client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })).storage.from(this.bucket);
  }

  async signedUpload(path: string) {
    const { data, error } = await this.storage.createSignedUploadUrl(path, { upsert: false });
    if (error) this.fail('signed-upload.create', path, error);
    return data!;
  }

  async signedDownload(path: string) {
    const { data, error } = await this.storage.createSignedUrl(path, Number(process.env.STORAGE_DOWNLOAD_TTL_SECONDS ?? 300));
    if (error) this.fail('signed-download.create', path, error);
    return data!;
  }

  async download(path: string) {
    const { data, error } = await this.storage.download(path);
    if (error) {
      this.logger.warn({ event: 'storage.operation.failed', operation: 'object.download', bucket: this.bucket, path: safeStoragePath(path), ...storageErrorDetails(error) });
      throw new DomainError('Uploaded document was not found', 'DOCUMENT_OBJECT_NOT_FOUND', 404);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async upload(path: string, content: Buffer, mimeType: string) {
    const { error } = await this.storage.upload(path, content, { contentType: mimeType, upsert: false });
    if (error) this.fail('object.upload', path, error);
  }

  async remove(path: string) {
    const { error } = await this.storage.remove([path]);
    if (error) this.fail('object.remove', path, error);
  }

  private fail(operation: string, path: string, error: unknown): never {
    this.logger.error({ event: 'storage.operation.failed', operation, bucket: this.bucket, path: safeStoragePath(path), ...storageErrorDetails(error) });
    throw new ServiceUnavailableException(`Document storage operation failed: ${operation}`);
  }
}
