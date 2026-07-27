import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { DataSource } from 'typeorm'
import * as argon2 from 'argon2'
import { AppModule } from '../app.module'
import { UserEntity } from '../auth/auth.entity'
import { OrganizationEntity } from '../onboarding/onboarding.entity'
import { TeamMemberEntity } from '../team/team.entity'
import { TeamRole } from '../team/team.dto'

async function seedVendor() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })

  try {
    const db = app.get(DataSource)
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
        user = users.create({ email, passwordHash, firstName, lastName, organizationId: organization.id, role: 'admin', isActive: true })
      } else {
        user.passwordHash = passwordHash
        user.firstName = firstName
        user.lastName = lastName
        user.organizationId = organization.id
        user.role = 'admin'
        user.isActive = true
      }
      user = await users.save(user)

      let member = await members.findOneBy({ userId: user.id })
      if (!member) member = members.create({ organizationId: organization.id, userId: user.id, firstName, lastName, email, role: TeamRole.Admin, status: 'active' })
      else Object.assign(member, { organizationId: organization.id, firstName, lastName, email, role: TeamRole.Admin, status: 'active' })
      await members.save(member)
    })

    console.log(`Activated seed vendor ready: ${email}`)
  } finally {
    await app.close()
  }
}

seedVendor().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
