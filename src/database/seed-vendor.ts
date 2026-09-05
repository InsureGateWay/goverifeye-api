import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { DataSource } from 'typeorm'
import * as argon2 from 'argon2'
import { AppModule } from '../app.module'
import { UserEntity } from '../auth/auth.entity'
import { OrganizationEntity } from '../onboarding/onboarding.entity'
import { TeamMemberEntity } from '../team/team.entity'
import { TeamRole } from '../team/team.dto'
import { ProductEntity } from '../products/product.entity'
import { ProductStatus } from '../products/product.model'
import { BatchStatus, CodeBatchEntity, CodeNamespaceEntity, OpenMarketBatchEntity, VerificationCodeEntity, VerificationCodeStatus } from '../codes/code.entity'
import { Fulfillment, LabelType } from '../codes/code.enums'
import { CryptographicCodeGenerator } from '../codes/cryptographic-code-generator.service'

async function seedVendor() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })

  try {
    const db = app.get(DataSource)
    const codeGenerator = app.get(CryptographicCodeGenerator)
    const email = (process.env.SEED_VENDOR_EMAIL ?? 'vendor.demo@goverifeye.test').trim().toLowerCase()
    const password = process.env.SEED_VENDOR_PASSWORD ?? 'Vendor123!'
    const firstName = (process.env.SEED_VENDOR_FIRST_NAME ?? 'Demo').trim()
    const lastName = (process.env.SEED_VENDOR_LAST_NAME ?? 'Vendor').trim()
    const companyName = (process.env.SEED_VENDOR_COMPANY_NAME ?? 'goVerifEye Demo Vendor Ltd').trim()
    const registrationNumber = (process.env.SEED_VENDOR_REGISTRATION_NUMBER ?? 'DEMO-RC-0001').trim()

    if (password.length < 6 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      throw new Error('SEED_VENDOR_PASSWORD must be at least 6 characters and include uppercase, lowercase, and a number')
    }

    await db.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity)
      const organizations = manager.getRepository(OrganizationEntity)
      const members = manager.getRepository(TeamMemberEntity)
      const products = manager.getRepository(ProductEntity)
      const batches = manager.getRepository(CodeBatchEntity)
      const codes = manager.getRepository(VerificationCodeEntity)
      const namespaces = manager.getRepository(CodeNamespaceEntity)
      const openMarketBatches=manager.getRepository(OpenMarketBatchEntity)
      let user = await users.findOneBy({ email })
      let organization = user
        ? await organizations.findOneBy({ id: user.organizationId })
        : await organizations.findOne({ where: [{ companyName }, { registrationNumber }] })

      if (!organization) {
        organization = organizations.create({
          ...(user ? { id: user.organizationId } : {}),
          companyName,
          registrationNumber,
          industry: 'Other',
          country: 'Nigeria',
          website: 'https://goverifeye.com',
          administrator: { firstName, lastName, email, phone: '+2348000000000' },
          address: { line1: '1 Demo Avenue', city: 'Lagos', state: 'Lagos', country: 'Nigeria', postalCode: '100001' },
          documents: [],
          status: 'approved',
        })
      } else {
        organization.companyName = companyName
        organization.registrationNumber = registrationNumber
        organization.industry ||= 'Other'
        organization.country ||= 'Nigeria'
        organization.administrator = { firstName, lastName, email, phone: organization.administrator?.phone ?? '+2348000000000' }
        organization.address ||= { line1: '1 Demo Avenue', city: 'Lagos', state: 'Lagos', country: 'Nigeria', postalCode: '100001' }
        organization.documents ||= []
        organization.status = 'approved'
      }
      organization = await organizations.save(organization)

      const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
      if (!user) {
        user = users.create({ email, passwordHash, firstName, lastName, organizationId: organization.id, role:'vendor_admin', isActive:true })
      } else {
        user.passwordHash = passwordHash
        user.firstName = firstName
        user.lastName = lastName
        user.organizationId = organization.id
        user.role = 'vendor_admin'
        user.isActive = true
      }
      user = await users.save(user)

      const seededProducts = [
        {
          name: 'Coca-Cola 33cl Bottle',
          description: 'A 33cl bottled soft drink seeded for product and code-generation demonstrations.',
          form: 'Liquid',
          manufacturer: companyName,
        },
        {
          name: 'ZigoCare Hand Sanitizer 500ml',
          description: 'A 500ml alcohol-based hand sanitizer seeded for verification demonstrations.',
          form: 'Gel',
          manufacturer: companyName,
        },
      ]
      const savedProducts: ProductEntity[] = []
      for (const details of seededProducts) {
        let product = await products.findOneBy({ organizationId: organization.id, name: details.name })
        if (!product) product = products.create({ ...details, organizationId: organization.id, createdBy: user.id })
        else Object.assign(product, details)
        product.createdBy = user.id
        product.status = ProductStatus.Active
        product.rejectionReason = undefined
        savedProducts.push(await products.save(product))
      }

      const seededBatches = [
        { key: 'demo-coca-main-01', product: savedProducts[0]!, labelType: LabelType.Main, fulfillment: Fulfillment.SelfPrint, paperSize: 'A4', manufacturingDate:'2026-03-15', expiryDate:'2028-03-15' },
        { key: 'demo-coca-micro-02', product: savedProducts[0]!, labelType: LabelType.Micro, fulfillment: Fulfillment.Preprinted, paperSize: 'Roll', logisticsService: 'GIG Logistics', manufacturingDate:'2026-04-10', expiryDate:'2028-04-10' },
        { key: 'demo-sanitizer-main-01', product: savedProducts[1]!, labelType: LabelType.Main, fulfillment: Fulfillment.SelfPrint, paperSize: 'A4', manufacturingDate:'2026-05-01', expiryDate:'2028-05-01' },
        { key: 'demo-sanitizer-pair-02', product: savedProducts[1]!, labelType: LabelType.Pair, fulfillment: Fulfillment.Preprinted, paperSize: 'Roll', logisticsService: 'GIG Logistics', manufacturingDate:'2026-06-12', expiryDate:'2028-06-12' },
      ]

      let codeNamespace=await namespaces.findOneBy({organizationId:organization.id})
      if(!codeNamespace){const allocated=await manager.query(`SELECT nextval('gve_namespace_sequence') AS value`);codeNamespace=await namespaces.save(namespaces.create({organizationId:organization.id,namespace:String(allocated[0]?.value).padStart(4,'0'),nextSerial:'1'}))}
      for (const definition of seededBatches) {
        let batch = await batches.findOneBy({ organizationId: organization.id, clientRequestId: definition.key })
        if (!batch) {
          batch = await batches.save(batches.create({
            organizationId: organization.id,
            clientRequestId: definition.key,
            productId: definition.product.id,
            generatedBy: user.id,
            labelType: definition.labelType,
            fulfillment: definition.fulfillment,
            paperSize: definition.paperSize,
            logisticsService: definition.logisticsService,
            manufacturingDate: definition.manufacturingDate,
            expiryDate: definition.expiryDate,
            quantity: 5,
            activationMode:'self_print_digital',
            status: BatchStatus.MarketActive,
            activatedAt:new Date(),activatedBy:user.id,
          }))
        } else {
          Object.assign(batch, {
            productId: definition.product.id,
            generatedBy: user.id,
            labelType: definition.labelType,
            fulfillment: definition.fulfillment,
            paperSize: definition.paperSize,
            logisticsService: definition.logisticsService,
            manufacturingDate: definition.manufacturingDate,
            expiryDate: definition.expiryDate,
            quantity: 5,
            activationMode:'self_print_digital',
            status: BatchStatus.MarketActive,
            activatedAt: new Date(),
            activatedBy: user.id,
          })
          batch = await batches.save(batch)
        }

        const existingCount = await codes.countBy({ organizationId: organization.id, batchId: batch.id })
        for (let index = existingCount; index < 5; index += 1) {
          const pair = codeGenerator.generate(codeNamespace.namespace,codeNamespace.nextSerial,batch.id)
          codeNamespace.nextSerial=(BigInt(codeNamespace.nextSerial)+1n).toString()
          await codes.save(codes.create({
            organizationId: organization.id,
            productId: definition.product.id,
            batchId: batch.id,
            code: pair.verificationCode,
            codeFormatVersion:pair.codeFormatVersion,keyVersion:pair.keyVersion,namespace:pair.namespace,internalSerial:pair.internalSerial,publicToken:pair.publicToken,luhnDigit:pair.luhnDigit,antiFabTag:pair.antiFabTag,allocationId:pair.allocationId,
            status: VerificationCodeStatus.MarketActive,
            activatedAt: new Date(),
            activatedBy: user.id,
          }))
        }
      }
      await namespaces.save(codeNamespace)

      for (const product of savedProducts) {
        product.totalCodes = await codes.countBy({ organizationId: organization.id, productId: product.id })
        await products.save(product)
      }
      const publicBatchId='8567-5654-8645-9875'
      if(!await openMarketBatches.existsBy({publicBatchId}))await openMarketBatches.save(openMarketBatches.create({publicBatchId,activationCodeHash:await argon2.hash('654321',{type:argon2.argon2id}),labelType:LabelType.Micro,quantity:2500,totalCost:36200,status:'available'}))

      let member = await members.findOneBy({ userId: user.id })
      if (!member) member = members.create({ organizationId: organization.id, userId: user.id, firstName, lastName, email, role: TeamRole.VendorAdmin, status: 'active' })
      else Object.assign(member, { organizationId: organization.id, firstName, lastName, email, role: TeamRole.VendorAdmin, status: 'active' })
      await members.save(member)
    })

    console.log(`Activated seed vendor, 2 active products, 4 batches, 20 active codes, and Open Market batch 8567-5654-8645-9875 ready: ${email}`)
  } finally {
    await app.close()
  }
}

seedVendor().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
