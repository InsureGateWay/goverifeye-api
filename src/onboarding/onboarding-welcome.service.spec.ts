import { UserRole } from '../auth/authorization';
import { OnboardingWelcomeService } from './onboarding-welcome.service';

describe('OnboardingWelcomeService decision notifications', () => {
  const organization = {
    id: 'vendor-id',
    companyName: 'Example Vendor',
    administrator: { firstName: 'Ada', email: 'vendor@example.com' },
  } as never;

  function setup(superAdmins = [{ id: 'super-id', email: 'super@example.com', firstName: 'Super' }]) {
    const enqueue = jest.fn().mockResolvedValue({});
    const render = jest.fn(async (_manager, _key, _variables, fallback) => fallback());
    const manager = {
      existsBy: jest.fn().mockResolvedValue(false),
      find: jest.fn().mockResolvedValue(superAdmins),
    };
    const service = new OnboardingWelcomeService({ enqueue } as never, { render } as never);
    return { service, enqueue, render, manager };
  }

  it('emails the vendor and every active Super Admin when onboarding is completed', async () => {
    const { service, enqueue, render, manager } = setup([
      { id: 'super-1', email: 'one@example.com', firstName: 'One' },
      { id: 'super-2', email: 'two@example.com', firstName: 'Two' },
    ]);
    await service.enqueueSubmissionOnce(manager as never, {
      id: 'vendor-id',
      companyName: 'Example Vendor',
      industry: 'Food & Beverage',
      country: 'Nigeria',
      administrator: { firstName: 'Ada', lastName: 'Okafor', email: 'vendor@example.com' },
    } as never);

    expect(render).toHaveBeenCalledWith(expect.anything(), 'vendor.onboarding_submitted', expect.anything(), expect.any(Function));
    expect(render).toHaveBeenCalledWith(expect.anything(), 'platform.vendor_onboarding_submitted', expect.objectContaining({ companyName: 'Example Vendor', vendorContactName: 'Ada Okafor' }), expect.any(Function));
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), 'email.send', 'onboarding-submitted', 'vendor-id', expect.objectContaining({ to: 'vendor@example.com' }));
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), 'email.send', 'platform-onboarding-submitted', 'vendor-id:super-1', expect.objectContaining({ to: 'one@example.com' }));
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), 'email.send', 'platform-onboarding-submitted', 'vendor-id:super-2', expect.objectContaining({ to: 'two@example.com' }));
  });

  it('does not duplicate vendor or Super Admin onboarding emails', async () => {
    const { service, enqueue, manager } = setup();
    manager.existsBy.mockResolvedValue(true);
    expect(await service.enqueueSubmissionOnce(manager as never, organization)).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('still alerts Super Admin when the vendor confirmation was already queued', async () => {
    const { service, enqueue, manager } = setup();
    manager.existsBy.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await service.enqueueSubmissionOnce(manager as never, organization)).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      'email.send',
      'platform-onboarding-submitted',
      'vendor-id:super-id',
      expect.objectContaining({ to: 'super@example.com' }),
    );
  });

  it('emails the vendor and every active Super Admin when a delegate approves', async () => {
    const { service, enqueue, render, manager } = setup([
      { id: 'super-1', email: 'one@example.com', firstName: 'One' },
      { id: 'super-2', email: 'two@example.com', firstName: 'Two' },
    ]);
    await service.enqueueDecisionOutcomeOnce(manager as never, organization, 'approved', 'Verified.', {
      userId: 'reviewer-id', organizationId: 'platform-id', sessionId: 'session-id',
      role: UserRole.PlatformAdmin, name: 'Pat Admin', email: 'pat@example.com',
    }, 'decision-id');

    expect(render).toHaveBeenCalledWith(expect.anything(), 'vendor.verified', expect.anything(), expect.any(Function));
    expect(render).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), 'email.send', 'onboarding-verified', 'decision-id', expect.objectContaining({ to: 'vendor@example.com' }));
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), 'email.send', 'platform-vendor-approved', 'decision-id:super-1', expect.objectContaining({ to: 'one@example.com' }));
    expect(manager.find).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ where: { role: UserRole.SuperAdmin, isActive: true } }));
  });

  it('emails the vendor with the rejection reason and alerts a Super Admin', async () => {
    const { service, enqueue, render, manager } = setup();
    await service.enqueueDecisionOutcomeOnce(manager as never, organization, 'rejected', 'CAC document is unreadable.', {
      userId: 'reviewer-id', organizationId: 'platform-id', sessionId: 'session-id',
      role: UserRole.PlatformStaff, name: 'Sam Staff', email: 'sam@example.com',
    }, 'decision-id');

    expect(render).toHaveBeenCalledWith(expect.anything(), 'vendor.rejected', expect.objectContaining({ reason: 'CAC document is unreadable.' }), expect.any(Function));
    expect(render).toHaveBeenCalledWith(expect.anything(), 'platform.vendor_rejected_by_delegate', expect.objectContaining({ reviewerName: 'Sam Staff' }), expect.any(Function));
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('does not alert other Super Admin users when the reviewer is a Super Admin', async () => {
    const { service, enqueue, manager } = setup();
    await service.enqueueDecisionOutcomeOnce(manager as never, organization, 'approved', undefined, {
      userId: 'super-id', organizationId: 'platform-id', sessionId: 'session-id',
      role: UserRole.SuperAdmin, name: 'Super Admin', email: 'super@example.com',
    }, 'decision-id');

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(manager.find).not.toHaveBeenCalled();
  });
});
