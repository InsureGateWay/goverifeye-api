import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

@Injectable()
export class ProductImageStorageService {
  private readonly logger = new Logger(ProductImageStorageService.name)
  private client?: SupabaseClient

  private get bucket() {
    return process.env.SUPABASE_PRODUCT_IMAGES_BUCKET ?? 'product-images'
  }

  private get storage() {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key || key.startsWith('replace-')) throw new ServiceUnavailableException('Product image storage is not configured')
    return (this.client ??= createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } })).storage.from(this.bucket)
  }

  async createUpload(organizationId:string, fileName:string) {
    const extension = fileName.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
    const path = `organizations/${organizationId}/products/${randomUUID()}.${extension}`
    const { data, error } = await this.storage.createSignedUploadUrl(path, { upsert:false })
    if (error) {
      this.logger.error({ event:'product-image.signed-upload.failed', organizationId, reason:error.message })
      throw new ServiceUnavailableException('Could not create a product image upload URL')
    }
    const { data:publicData } = this.storage.getPublicUrl(path)
    return { uploadUrl:data.signedUrl, path, publicUrl:publicData.publicUrl }
  }
}
