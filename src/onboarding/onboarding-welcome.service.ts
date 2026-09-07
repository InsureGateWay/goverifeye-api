import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OutboxMessageEntity } from '../operations/operations.entity';
import { ReliabilityService } from '../operations/reliability.service';
import { platformVendorDecisionEmail, vendorOnboardingSubmittedEmail, vendorRejectedEmail, vendorVerifiedEmail } from '../operations/email-templates';
import { OrganizationEntity } from './onboarding.entity';
import { EmailTemplateService } from '../operations/email-template.service';
import { RequestContext } from '../common/request-context';
import { UserEntity } from '../auth/auth.entity';
import { UserRole } from '../auth/authorization';

@Injectable()
export class OnboardingWelcomeService {
  constructor(private readonly reliability: ReliabilityService,private readonly emailTemplates:EmailTemplateService) {}

  async enqueueSubmissionOnce(manager: EntityManager, organization: OrganizationEntity) {
    const alreadyQueued = await manager.existsBy(OutboxMessageEntity, {
      topic: 'email.send',
      aggregateType: 'onboarding-submitted',
      aggregateId: organization.id,
    });
    if (alreadyQueued) return false;

    const appUrl = (process.env.APP_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
    const variables = {
      firstName: organization.administrator?.firstName,
      companyName: organization.companyName,
      dashboardUrl: `${appUrl}/dashboard`,
      termsUrl: process.env.TERMS_AND_CONDITIONS_URL ?? `${appUrl}/terms-and-conditions`,
      userGuideUrl: process.env.USER_GUIDE_URL ?? `${appUrl}/user-guide`,
      dataUsePolicyUrl: process.env.DATA_USE_POLICY_URL ?? `${appUrl}/data-use-policy`,
    };
    const email = await this.emailTemplates.render(manager,'vendor.onboarding_submitted',variables,()=>vendorOnboardingSubmittedEmail(variables));

    await this.reliability.enqueue(manager, 'email.send', 'onboarding-submitted', organization.id, {
      to: organization.administrator.email,
      ...email,
    });
    return true;
  }

  async enqueueVerifiedOnce(manager: EntityManager, organization: OrganizationEntity, eventId = organization.id) {
    const alreadyQueued = await manager.existsBy(OutboxMessageEntity, {
      topic: 'email.send',
      aggregateType: 'onboarding-verified',
      aggregateId: eventId,
    });
    if (alreadyQueued) return false;
    const appUrl = (process.env.APP_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
    const variables = {
      firstName: organization.administrator?.firstName,
      companyName: organization.companyName,
      dashboardUrl: `${appUrl}/dashboard`,
      userGuideUrl: process.env.USER_GUIDE_URL ?? `${appUrl}/user-guide`,
    };
    const email = await this.emailTemplates.render(manager,'vendor.verified',variables,()=>vendorVerifiedEmail(variables));
    await this.reliability.enqueue(manager, 'email.send', 'onboarding-verified', eventId, {
      to: organization.administrator.email,
      ...email,
    });
    return true;
  }

  async enqueueDecisionOutcomeOnce(
    manager: EntityManager,
    organization: OrganizationEntity,
    decision: 'approved' | 'rejected',
    notes: string | undefined,
    reviewer: RequestContext,
    eventId: string,
  ) {
    if (decision === 'approved') {
      await this.enqueueVerifiedOnce(manager, organization, eventId);
    } else {
      await this.enqueueRejectedOnce(manager, organization, notes, eventId);
    }

    if (reviewer.role !== UserRole.SuperAdmin) {
      await this.enqueueSuperAdminDecisionOnce(manager, organization, decision, notes, reviewer, eventId);
    }
  }

  private async enqueueRejectedOnce(
    manager: EntityManager,
    organization: OrganizationEntity,
    notes?: string,
    eventId = organization.id,
  ) {
    const alreadyQueued = await manager.existsBy(OutboxMessageEntity, {
      topic: 'email.send',
      aggregateType: 'onboarding-rejected',
      aggregateId: eventId,
    });
    if (alreadyQueued) return false;
    const appUrl = (process.env.APP_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
    const variables = {
      firstName: organization.administrator?.firstName,
      companyName: organization.companyName,
      reason: notes?.trim() || 'The submitted information did not meet the current verification requirements.',
      onboardingUrl: `${appUrl}/onboarding`,
    };
    const email = await this.emailTemplates.render(manager, 'vendor.rejected', variables, () => vendorRejectedEmail(variables));
    await this.reliability.enqueue(manager, 'email.send', 'onboarding-rejected', eventId, {
      to: organization.administrator.email,
      ...email,
    });
    return true;
  }

  private async enqueueSuperAdminDecisionOnce(
    manager: EntityManager,
    organization: OrganizationEntity,
    decision: 'approved' | 'rejected',
    notes: string | undefined,
    reviewer: RequestContext,
    eventId: string,
  ) {
    const recipients = await manager.find(UserEntity, {
      where: { role: UserRole.SuperAdmin, isActive: true },
      order: { createdAt: 'ASC' },
    });
    const appUrl = (process.env.APP_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
    const reviewerName = reviewer.name?.trim() || reviewer.email || reviewer.userId;
    const reviewerEmail = reviewer.email || 'Not available';
    const reviewerRole = reviewer.role.replaceAll('_', ' ');
    const reviewNotes = notes?.trim() || 'No review notes were provided.';
    for (const recipient of recipients) {
      const aggregateType = `platform-vendor-${decision}`;
      const aggregateId = `${eventId}:${recipient.id}`;
      const alreadyQueued = await manager.existsBy(OutboxMessageEntity, {
        topic: 'email.send',
        aggregateType,
        aggregateId,
      });
      if (alreadyQueued) continue;
      const variables = {
        firstName: recipient.firstName,
        companyName: organization.companyName,
        decision,
        reviewerName,
        reviewerEmail,
        reviewerRole,
        notes: reviewNotes,
        vendorUrl: `${appUrl}/admin/vendors/${organization.id}`,
      };
      const templateKey = decision === 'approved'
        ? 'platform.vendor_approved_by_delegate'
        : 'platform.vendor_rejected_by_delegate';
      const email = await this.emailTemplates.render(manager, templateKey, variables, () => platformVendorDecisionEmail(variables));
      await this.reliability.enqueue(manager, 'email.send', aggregateType, aggregateId, {
        to: recipient.email,
        ...email,
      });
    }
  }
}
