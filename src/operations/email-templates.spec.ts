import { invitationEmail, passwordResetCodeEmail, vendorOnboardingSubmittedEmail, vendorVerifiedEmail, verificationCodeEmail } from './email-templates';

describe('email templates', () => {
  it('renders a branded verification email with a plain-text fallback', () => {
    const email = verificationCodeEmail('123456', 10);
    expect(email.subject).toContain('verification code');
    expect(email.text).toContain('123456');
    expect(email.html).toContain('go<span');
    expect(email.html).toContain('123456');
    expect(email.html).toContain('10 minutes');
  });

  it('escapes invitation content and includes the secure action URL', () => {
    const email = invitationEmail({
      firstName: '<Alex>',
      role: 'admin',
      invitationUrl: 'https://portal.example/invite?token=abc&source=email',
      expiresInDays: 7,
    });
    expect(email.html).toContain('&lt;Alex&gt;');
    expect(email.html).not.toContain('Hi <Alex>');
    expect(email.html).toContain('token=abc&amp;source=email');
    expect(email.text).toContain('https://portal.example/invite');
  });

  it('renders vendor next steps and all required policy links', () => {
    const email = vendorOnboardingSubmittedEmail({
      firstName: '<Ada>',
      companyName: 'Example & Sons',
      dashboardUrl: 'https://app.example/dashboard',
      termsUrl: 'https://app.example/terms?version=1&locale=en',
      userGuideUrl: 'https://docs.example/guide',
      dataUsePolicyUrl: 'https://app.example/data-use',
    });

    expect(email.subject).toContain('Example & Sons');
    expect(email.html).toContain('&lt;Ada&gt;');
    expect(email.html).toContain('Your next steps');
    expect(email.html).toContain('terms?version=1&amp;locale=en');
    expect(email.html).toContain('https://docs.example/guide');
    expect(email.html).toContain('https://app.example/data-use');
    expect(email.text).toContain('Next steps:');
    expect(email.text).toContain('Terms and Conditions:');
    expect(email.text).toContain('Data Use Policy:');
  });

  it('renders a separate administrator-verification email', () => {
    const email = vendorVerifiedEmail({
      firstName: 'Ada',
      companyName: 'Example & Sons',
      dashboardUrl: 'https://app.example/dashboard',
      userGuideUrl: 'https://docs.example/guide',
    });
    expect(email.subject).toContain('has been verified');
    expect(email.html).toContain('administrator has verified');
    expect(email.text).toContain('vendor account is now active');
  });

  it('renders a single-use password reset code email', () => {
    const email = passwordResetCodeEmail({firstName:'Ada',code:'482193',expiresInMinutes:10});
    expect(email.subject).toContain('Reset');
    expect(email.html).toContain('482193');
    expect(email.html).toContain('10 minutes');
    expect(email.text).toContain('reset code');
  });
});
