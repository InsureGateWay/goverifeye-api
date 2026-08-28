import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { DataSource } from 'typeorm'
import * as argon2 from 'argon2'
import { AppModule } from '../app.module'
import { UserEntity } from '../auth/auth.entity'
import { OrganizationEntity } from '../onboarding/onboarding.entity'

/**
 * Seeds / promotes a platform_admin user for Admin Portal testing.
 *
 * Env overrides:
 *   SEED_PLATFORM_ADMIN_EMAIL
 *   SEED_PLATFORM_ADMIN_PASSWORD
 *   SEED_PLATFORM_ADMIN_FIRST_NAME
 *   SEED_PLATFORM_ADMIN_LAST_NAME
 */
async function seedPlatformAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })

  try {
    const db = app.get(DataSource)
    const email = (
      process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'admin.demo@goverifeye.test'
    )
      .trim()
      .toLowerCase()
    const password =
      process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? 'Admin123!'
    const firstName = (
      process.env.SEED_PLATFORM_ADMIN_FIRST_NAME ?? 'Platform'
    ).trim()
    const lastName = (
      process.env.SEED_PLATFORM_ADMIN_LAST_NAME ?? 'Admin'
    ).trim()

    if (
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
          role: 'platform_admin',
          isActive: true,
        })
      } else {
        user.passwordHash = passwordHash
        user.firstName = firstName
        user.lastName = lastName
        user.organizationId = organization.id
        user.role = 'platform_admin'
        user.isActive = true
      }
      await users.save(user)
    })

    // eslint-disable-next-line no-console
    console.log(
      `Platform admin ready: ${email} / (password from SEED_PLATFORM_ADMIN_PASSWORD or Admin123!)`,
    )
  } finally {
    await app.close()
  }
}

void seedPlatformAdmin()
