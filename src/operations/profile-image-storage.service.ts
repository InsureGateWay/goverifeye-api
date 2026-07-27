import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

@Injectable()
export class ProfileImageStorageService {
  private client?:SupabaseClient
  private get bucket(){return process.env.SUPABASE_PROFILE_IMAGES_BUCKET??'profile-images'}
  private get storage(){
    const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
    if(!url||!key||key.startsWith('replace-'))throw new ServiceUnavailableException('Profile image storage is not configured')
    return(this.client??=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})).storage.from(this.bucket)
  }
  async createUpload(organizationId:string,userId:string,fileName:string){
    const extension=fileName.toLowerCase().endsWith('.png')?'png':'jpg'
    const path=`organizations/${organizationId}/profiles/${userId}/${randomUUID()}.${extension}`
    const{data,error}=await this.storage.createSignedUploadUrl(path,{upsert:false})
    if(error)throw new ServiceUnavailableException('Could not create a profile image upload URL')
    return{uploadUrl:data.signedUrl,path,publicUrl:this.storage.getPublicUrl(path).data.publicUrl}
  }
}
