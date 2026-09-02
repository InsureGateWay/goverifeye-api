import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { DataSource } from 'typeorm'
import * as argon2 from 'argon2'
import { AppModule } from '../app.module'
import { UserEntity } from '../auth/auth.entity'
import { OrganizationEntity } from '../onboarding/onboarding.entity'
import { ApplicationOptionEntity } from '../governance/governance.entity'
import { EmailTemplateEntity, EmailTemplateHistoryEntity } from '../operations/email-template.entity'
import { invitationEmail, passwordResetCodeEmail, vendorOnboardingSubmittedEmail, vendorVerifiedEmail, verificationCodeEmail } from '../operations/email-templates'

/**
 * Seeds / promotes the platform super_admin users for Admin Portal testing.
 *
 * Env overrides:
 *   SEED_PLATFORM_ADMIN_EMAIL
 *   SEED_PLATFORM_ADMIN_PASSWORD
 *   SEED_PLATFORM_ADMIN_FIRST_NAME
 *   SEED_PLATFORM_ADMIN_LAST_NAME
 *   SEED_PLATFORM_ADMIN_RESET_PASSWORD=true (explicitly rotate an existing account)
 */
export async function seedPlatformAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })

  try {
    const db = app.get(DataSource)
    const email = (
      process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'senorleo12@yahoo.com'
    )
      .trim()
      .toLowerCase()
    const password = process.env.SEED_PLATFORM_ADMIN_PASSWORD?.trim()
    const firstName = (
      process.env.SEED_PLATFORM_ADMIN_FIRST_NAME ?? 'Super'
    ).trim()
    const lastName = (
      process.env.SEED_PLATFORM_ADMIN_LAST_NAME ?? 'Admin'
    ).trim()

    if (
      !password ||
      password.length < 6 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw new Error(
        'SEED_PLATFORM_ADMIN_PASSWORD must be at least 6 characters and include uppercase, lowercase, and a number',
      )
    }

    await db.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity)
      const organizations = manager.getRepository(OrganizationEntity)

      let user = await users.findOneBy({ email })
      let organization = user
        ? await organizations.findOneBy({ id: user.organizationId })
        : await organizations.findOneBy({
            companyName: 'goVerifEye Platform Ops',
          })

      if (!organization) {
        organization = organizations.create({
          ...(user ? { id: user.organizationId } : {}),
          companyName: 'goVerifEye Platform Ops',
          registrationNumber: 'PLATFORM-OPS-0001',
          industry: 'Technology',
          country: 'Nigeria',
          website: 'https://goverifyeye.com',
          administrator: {
            firstName,
            lastName,
            email,
            phone: '+2348000000001',
          },
          address: {
            line1: '1 Platform Way',
            city: 'Lagos',
            state: 'Lagos',
            country: 'Nigeria',
            postalCode: '100001',
          },
          documents: [],
          status: 'approved',
        })
        organization = await organizations.save(organization)
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      })

      if (!user) {
        user = users.create({
          email,
          passwordHash,
          firstName,
          lastName,
          organizationId: organization.id,
          role: 'super_admin',
          isActive: true,
        })
      } else {
        if (process.env.SEED_PLATFORM_ADMIN_RESET_PASSWORD === 'true') {
          user.passwordHash = passwordHash
        }
        user.firstName = firstName
        user.lastName = lastName
        user.organizationId = organization.id
        user.role = 'super_admin'
        user.isActive = true
      }
      user = await users.save(user)

      const secondaryEmail = 'chelseahart234@gmail.com'
      let secondaryUser = await users.findOneBy({ email: secondaryEmail })
      if (!secondaryUser) {
        secondaryUser = users.create({
          email: secondaryEmail,
          passwordHash: user.passwordHash,
          firstName: 'Chelsea',
          lastName: 'Hart',
          organizationId: organization.id,
          role: 'super_admin',
          isActive: true,
        })
      } else {
        secondaryUser.passwordHash = user.passwordHash
        secondaryUser.firstName = 'Chelsea'
        secondaryUser.lastName = 'Hart'
        secondaryUser.organizationId = organization.id
        secondaryUser.role = 'super_admin'
        secondaryUser.isActive = true
      }
      await users.save(secondaryUser)

      const options = manager.getRepository(ApplicationOptionEntity)
      const defaults = [
        ...['Pharmaceuticals','Food & Beverage','Cosmetics','Electronics','Automotive','Agriculture'].map((label,index)=>({namespace:'onboarding.industries',key:label.toLowerCase().replace(/[^a-z0-9]+/g,'_'),label,value:label,valueType:'string',isPublic:true,sortOrder:index})),
        {namespace:'onboarding.countries',key:'NG',label:'Nigeria',value:{code:'NG',name:'Nigeria',dialCode:'+234'},valueType:'object',isPublic:true,sortOrder:0},
        {namespace:'codes',key:'verification_code_length',label:'Verification code length',value:16,valueType:'number',isPublic:false,sortOrder:0,description:'Global length for newly generated numeric product verification codes. Existing codes remain valid.',validation:{min:6,max:28}},
        ...['Tablet','Capsule','Liquid','Powder','Device','Packaged Good'].map((label,index)=>({namespace:'products.forms',key:label.toLowerCase().replace(/[^a-z0-9]+/g,'_'),label,value:label,valueType:'string',isPublic:false,sortOrder:index})),
        ...[{key:'micro',label:'Micro label',value:{code:'micro',fulfillment:['preprinted','selfprint']}},{key:'main',label:'Main label',value:{code:'main',fulfillment:['preprinted','selfprint']}},{key:'pair',label:'Paired labels',value:{code:'pair',fulfillment:['preprinted','selfprint']}}].map((row,index)=>({namespace:'codes.label_types',...row,valueType:'object',isPublic:false,sortOrder:index})),
      ]
      for (const option of defaults) {
        if (await options.existsBy({ namespace: option.namespace, key: option.key })) continue
        const managedOption = option as typeof option & { description?: string | null; validation?: Record<string, unknown> }
        await options.save(options.create({ ...option, organizationId:null, description:managedOption.description??null, validation:managedOption.validation??{}, isActive:true, createdById:user.id, updatedById:user.id }))
      }

      const templateRepo=manager.getRepository(EmailTemplateEntity)
      const templateHistory=manager.getRepository(EmailTemplateHistoryEntity)
      const variables=(content:{subject:string;text:string;html:string})=>[...new Set([...content.subject.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*}}/g),...content.text.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*}}/g),...content.html.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*}}/g)].map((m)=>m[1]!))]
      const rawTemplates=[
        {key:'auth.registration_otp',name:'Registration verification code',audience:'security',description:'Sent when a prospective vendor verifies their registration email.',content:verificationCodeEmail('{{code}}','{{expiresInMinutes}}' as unknown as number)},
        {key:'auth.open_market_otp',name:'Open-market claim verification code',audience:'security',description:'Sent to a vendor user while linking an open-market code batch.',content:verificationCodeEmail('{{code}}','{{expiresInMinutes}}' as unknown as number)},
        {key:'auth.password_reset',name:'Password reset code',audience:'security',description:'Sent after a valid password-reset request.',content:passwordResetCodeEmail({firstName:'{{firstName}}',code:'{{code}}',expiresInMinutes:'{{expiresInMinutes}}' as unknown as number})},
        {key:'team.invitation',name:'Team invitation',audience:'staff',description:'Sent for vendor and platform team invitations and resends.',content:invitationEmail({firstName:'{{firstName}}',role:'{{role}}',invitationUrl:'{{invitationUrl}}',expiresInDays:'{{expiresInDays}}' as unknown as number})},
        {key:'vendor.onboarding_submitted',name:'Vendor onboarding submitted',audience:'vendor',description:'Confirms onboarding submission to the vendor administrator.',content:vendorOnboardingSubmittedEmail({firstName:'{{firstName}}',companyName:'{{companyName}}',dashboardUrl:'{{dashboardUrl}}',termsUrl:'{{termsUrl}}',userGuideUrl:'{{userGuideUrl}}',dataUsePolicyUrl:'{{dataUsePolicyUrl}}'})},
        {key:'vendor.verified',name:'Vendor approved',audience:'vendor',description:'Sent when a platform administrator approves vendor onboarding.',content:vendorVerifiedEmail({firstName:'{{firstName}}',companyName:'{{companyName}}',dashboardUrl:'{{dashboardUrl}}',userGuideUrl:'{{userGuideUrl}}'})},
      ]
      for(const item of rawTemplates){
        if(await templateRepo.existsBy({key:item.key,versionNumber:1}))continue
        const row=await templateRepo.save(templateRepo.create({key:item.key,name:item.name,audience:item.audience,status:'active',versionNumber:1,subjectTemplate:item.content.subject,textTemplate:item.content.text,htmlTemplate:item.content.html,requiredVariables:variables(item.content),description:item.description,isSystem:true,activatedAt:new Date(),activatedById:user.id,createdById:user.id,updatedById:user.id}))
        await templateHistory.save(templateHistory.create({templateId:row.id,key:row.key,action:'activate',snapshot:{key:row.key,name:row.name,audience:row.audience,status:row.status,versionNumber:row.versionNumber,subjectTemplate:row.subjectTemplate,textTemplate:row.textTemplate,htmlTemplate:row.htmlTemplate,requiredVariables:row.requiredVariables,description:row.description},reason:'Initial system template seed',createdById:user.id,updatedById:user.id}))
      }
    })

    // eslint-disable-next-line no-console
    console.log(
      `Platform admin ready: ${email} / password supplied through SEED_PLATFORM_ADMIN_PASSWORD`,
    )
  } finally {
    await app.close()
  }
}

const invokedDirectly =
  require.main === module ||
  process.argv.some((arg) => arg.includes('seed-platform-admin'))

if (invokedDirectly) {
  void seedPlatformAdmin().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
