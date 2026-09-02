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

  async createDocumentUpload(organizationId:string, fileName:string) {
    const extension = fileName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'pdf'
    const path = `organizations/${organizationId}/products/documents/${randomUUID()}.${extension}`
    const { data, error } = await this.storage.createSignedUploadUrl(path, { upsert:false })
    if (error) {
      this.logger.error({ event:'product-document.signed-upload.failed', organizationId, reason:error.message })
      throw new ServiceUnavailableException('Could not create a product document upload URL')
    }
    const { data:publicData } = this.storage.getPublicUrl(path)
    return { uploadUrl:data.signedUrl, path, publicUrl:publicData.publicUrl }
  }

  async createVendorLogoUpload(organizationId:string, fileName:string) {
    const extension = fileName.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
    const path = `organizations/${organizationId}/branding/${randomUUID()}.${extension}`
    const { data, error } = await this.storage.createSignedUploadUrl(path, { upsert:false })
    if (error) {
      this.logger.error({ event:'vendor-logo.signed-upload.failed', organizationId, reason:error.message })
      throw new ServiceUnavailableException('Could not create a vendor logo upload URL')
    }
    return { uploadUrl:data.signedUrl, path, publicUrl:this.storage.getPublicUrl(path).data.publicUrl }
  }

  assertVendorLogo(organizationId:string, publicUrl:string) {
    this.managedVendorLogoPath(organizationId, publicUrl)
  }

  async removeVendorLogo(organizationId:string, publicUrl:string) {
    const path = this.managedVendorLogoPath(organizationId, publicUrl)
    const { error } = await this.storage.remove([path])
    if (error) {
      this.logger.error({ event:'vendor-logo.delete.failed', organizationId, reason:error.message })
      throw new ServiceUnavailableException('Could not delete the vendor logo')
    }
  }

  async removeProductImage(organizationId:string, publicUrl:string) {
    const path = this.managedPath(organizationId, publicUrl, false)
    const { error } = await this.storage.remove([path])
    if (error) {
      this.logger.error({ event:'product-image.delete.failed', organizationId, reason:error.message })
      throw new ServiceUnavailableException('Could not delete the product image')
    }
  }

  async removeProductDocument(organizationId:string, publicUrl:string) {
    const path = this.managedPath(organizationId, publicUrl, true)
    const { error } = await this.storage.remove([path])
    if (error) {
      this.logger.error({ event:'product-document.delete.failed', organizationId, reason:error.message })
      throw new ServiceUnavailableException('Could not delete the product document')
    }
  }

  private managedPath(organizationId:string, publicUrl:string, document:boolean) {
    const configuredUrl = process.env.SUPABASE_URL
    if (!configuredUrl) throw new ServiceUnavailableException('Product image storage is not configured')
    let supplied:URL, configured:URL
    try { supplied = new URL(publicUrl); configured = new URL(configuredUrl) }
    catch { throw new ServiceUnavailableException('The stored product image URL is invalid') }
    const marker = `/storage/v1/object/public/${this.bucket}/`
    if (supplied.origin !== configured.origin || !supplied.pathname.startsWith(marker)) {
      throw new ServiceUnavailableException('The stored product image is not managed by this service')
    }
    const path = decodeURIComponent(supplied.pathname.slice(marker.length))
    const expectedPrefix = `organizations/${organizationId}/products/${document ? 'documents/' : ''}`
    if (!path.startsWith(expectedPrefix) || path.slice(expectedPrefix.length).includes('/')) {
      throw new ServiceUnavailableException(`The stored product ${document ? 'document' : 'image'} does not belong to this vendor`)
    }
    return path
  }

  private managedVendorLogoPath(organizationId:string, publicUrl:string) {
    const configuredUrl = process.env.SUPABASE_URL
    if (!configuredUrl) throw new ServiceUnavailableException('Vendor logo storage is not configured')
    let supplied:URL, configured:URL
    try { supplied = new URL(publicUrl); configured = new URL(configuredUrl) }
    catch { throw new ServiceUnavailableException('The stored vendor logo URL is invalid') }
    const marker = `/storage/v1/object/public/${this.bucket}/`
    if (supplied.origin !== configured.origin || !supplied.pathname.startsWith(marker)) {
      throw new ServiceUnavailableException('The stored vendor logo is not managed by this service')
    }
    const path = decodeURIComponent(supplied.pathname.slice(marker.length))
    const expectedPrefix = `organizations/${organizationId}/branding/`
    if (!path.startsWith(expectedPrefix) || path.slice(expectedPrefix.length).includes('/')) {
      throw new ServiceUnavailableException('The stored vendor logo does not belong to this vendor')
    }
    return path
  }
}
