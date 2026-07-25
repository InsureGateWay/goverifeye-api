import { onboardingSubmissionStatus } from './onboarding-status';

describe('onboardingSubmissionStatus', () => {
  it('keeps manual platform approval as the default', () => {
    expect(onboardingSubmissionStatus({})).toBe('submitted');
  });

  it('automatically approves onboarding only when the demo flag is explicitly enabled', () => {
    expect(onboardingSubmissionStatus({ DEMO_AUTO_APPROVE_ONBOARDING: 'true' })).toBe('approved');
    expect(onboardingSubmissionStatus({ DEMO_AUTO_APPROVE_ONBOARDING: 'false' })).toBe('submitted');
  });
});
