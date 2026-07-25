import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OutboxMessageEntity } from '../operations/operations.entity';
import { ReliabilityService } from '../operations/reliability.service';
import { vendorOnboardingSubmittedEmail, vendorVerifiedEmail } from '../operations/email-templates';
import { OrganizationEntity } from './onboarding.entity';

@Injectable()
export class OnboardingWelcomeService {
  constructor(private readonly reliability: ReliabilityService) {}

  async enqueueSubmissionOnce(manager: EntityManager, organization: OrganizationEntity) {
    const alreadyQueued = await manager.existsBy(OutboxMessageEntity, {
      topic: 'email.send',
      aggregateType: 'onboarding-submitted',
      aggregateId: organization.id,
    });
    if (alreadyQueued) return false;

    const appUrl = (process.env.APP_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
    const email = vendorOnboardingSubmittedEmail({
      firstName: organization.administrator?.firstName,
      companyName: organization.companyName,
      dashboardUrl: `${appUrl}/dashboard`,
      termsUrl: process.env.TERMS_AND_CONDITIONS_URL ?? `${appUrl}/terms-and-conditions`,
      userGuideUrl: process.env.USER_GUIDE_URL ?? `${appUrl}/user-guide`,
      dataUsePolicyUrl: process.env.DATA_USE_POLICY_URL ?? `${appUrl}/data-use-policy`,
    });

    await this.reliability.enqueue(manager, 'email.send', 'onboarding-submitted', organization.id, {
      to: organization.administrator.email,
      ...email,
    });
    return true;
  }

  async enqueueVerifiedOnce(manager: EntityManager, organization: OrganizationEntity) {
    const alreadyQueued = await manager.existsBy(OutboxMessageEntity, {
      topic: 'email.send',
      aggregateType: 'onboarding-verified',
      aggregateId: organization.id,
    });
    if (alreadyQueued) return false;
    const appUrl = (process.env.APP_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
    const email = vendorVerifiedEmail({
      firstName: organization.administrator?.firstName,
      companyName: organization.companyName,
      dashboardUrl: `${appUrl}/dashboard`,
      userGuideUrl: process.env.USER_GUIDE_URL ?? `${appUrl}/user-guide`,
    });
    await this.reliability.enqueue(manager, 'email.send', 'onboarding-verified', organization.id, {
      to: organization.administrator.email,
      ...email,
    });
    return true;
  }
}
