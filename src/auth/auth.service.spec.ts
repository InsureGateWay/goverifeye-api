import { AuthService } from './auth.service';

describe('AuthService login identity flow', () => {
  const users = { existsBy: jest.fn(), findOneBy: jest.fn() };
  const otps = { findOne: jest.fn() };
  const audit = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
  const db = { getRepository: jest.fn(() => audit) };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      {} as never,
      {} as never,
      users as never,
      otps as never,
      {} as never,
      db as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('gives registered and unknown email addresses the same password step', async () => {
    users.findOneBy.mockResolvedValueOnce({ id: 'user-1', organizationId: 'org-1' });
    await expect(service.identifyLogin(' Registered@Example.com ')).resolves.toEqual({ next: 'password' });

    users.findOneBy.mockResolvedValueOnce(null);
    otps.findOne.mockResolvedValueOnce(null);
    await expect(service.identifyLogin(' Unknown@Example.com ')).resolves.toEqual({ next: 'password' });
    expect(audit.save).toHaveBeenCalledTimes(2);
    expect(audit.create).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'login.email_checked',
      actorId: null,
      organizationId: null,
      metadata: expect.objectContaining({ actorEmail: 'unknown@example.com' }),
    }));
  });

  it('sends a new OTP when an unfinished registration exists', async () => {
    users.findOneBy.mockResolvedValueOnce(null);
    otps.findOne.mockResolvedValueOnce({ id: 'old-challenge' });
    jest.spyOn(service, 'requestOtp').mockResolvedValueOnce({
      challengeId: 'new-challenge',
      expiresInSeconds: 600,
      message: 'sent',
    });

    await expect(service.identifyLogin(' Pending@Example.com ')).resolves.toEqual({
      next: 'registration_otp',
      challengeId: 'new-challenge',
      expiresInSeconds: 600,
    });
    expect(service.requestOtp).toHaveBeenCalledWith('pending@example.com');
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'login.registration_resumed',
      resourceType: 'authentication',
    }));
  });

  it('audits an unknown-email password attempt without storing the password', async () => {
    users.findOneBy.mockResolvedValueOnce(null);

    await expect(service.login(' Unknown@Example.com ', 'NeverStoreThis123')).rejects.toMatchObject({
      status: 401,
    });
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'login.failed',
      status: 'failed',
      metadata: expect.objectContaining({
        actorEmail: 'unknown@example.com',
        details: 'Invalid credentials',
      }),
    }));
    expect(JSON.stringify(audit.create.mock.calls)).not.toContain('NeverStoreThis123');
  });
});
