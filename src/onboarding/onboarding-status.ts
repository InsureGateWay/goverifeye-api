export type OnboardingSubmissionStatus = 'submitted' | 'approved';

export function onboardingSubmissionStatus(environment: NodeJS.ProcessEnv = process.env): OnboardingSubmissionStatus {
  return environment.DEMO_AUTO_APPROVE_ONBOARDING?.toLowerCase() === 'true' ? 'approved' : 'submitted';
}
