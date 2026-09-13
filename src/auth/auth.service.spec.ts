import { AuthService } from './auth.service';

describe('AuthService login identity flow', () => {
  const users = { existsBy: jest.fn() };
  const otps = { findOne: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      {} as never,
      {} as never,
      users as never,
      otps as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('gives registered and unknown email addresses the same password step', async () => {
    users.existsBy.mockResolvedValueOnce(true);
    await expect(service.identifyLogin(' Registered@Example.com ')).resolves.toEqual({ next: 'password' });

    users.existsBy.mockResolvedValueOnce(false);
    otps.findOne.mockResolvedValueOnce(null);
    await expect(service.identifyLogin(' Unknown@Example.com ')).resolves.toEqual({ next: 'password' });
  });

  it('sends a new OTP when an unfinished registration exists', async () => {
    users.existsBy.mockResolvedValueOnce(false);
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
  });
});
