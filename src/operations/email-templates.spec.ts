import { invitationEmail, passwordResetCodeEmail, platformVendorDecisionEmail, platformVendorOnboardingSubmittedEmail, vendorOnboardingSubmittedEmail, vendorRejectedEmail, vendorVerifiedEmail, verificationCodeEmail } from './email-templates';

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
    expect(email.html).toContain('#0b66c3');
    expect(email.html).toContain('Vendor Admin');
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

  it('renders a Super Admin notification when vendor onboarding is submitted', () => {
    const email = platformVendorOnboardingSubmittedEmail({
      firstName: 'Super',
      companyName: 'Example & Sons',
      vendorContactName: 'Ada Okafor',
      vendorEmail: 'ada@example.com',
      industry: 'Food & Beverage',
      country: 'Nigeria',
      reviewUrl: 'https://app.example/admin/vendors/vendor-id',
    });
    expect(email.subject).toContain('submitted onboarding');
    expect(email.text).toContain('Ada Okafor');
    expect(email.html).toContain('Example &amp; Sons');
    expect(email.html).toContain('Review vendor application');
    expect(email.html).toContain('https://app.example/admin/vendors/vendor-id');
  });

  it('renders the rejection reason for the vendor safely', () => {
    const email = vendorRejectedEmail({
      firstName: 'Ada',
      companyName: 'Example & Sons',
      reason: '<Missing document>',
      onboardingUrl: 'https://app.example/onboarding',
    });
    expect(email.subject).toContain('was not approved');
    expect(email.html).toContain('&lt;Missing document&gt;');
    expect(email.html).not.toContain('<Missing document>');
    expect(email.text).toContain('Reason: <Missing document>');
  });

  it('renders the delegated vendor decision for a Super Admin', () => {
    const email = platformVendorDecisionEmail({
      firstName: 'Super',
      companyName: 'Example & Sons',
      decision: 'approved',
      reviewerName: 'Pat Admin',
      reviewerEmail: 'pat@example.com',
      reviewerRole: 'platform admin',
      notes: 'Documents verified.',
      vendorUrl: 'https://app.example/admin/vendors/vendor-id',
    });
    expect(email.subject).toContain('was approved by Pat Admin');
    expect(email.text).toContain('platform admin');
    expect(email.html).toContain('View vendor record');
  });

  it('renders a single-use password reset code email', () => {
    const email = passwordResetCodeEmail({firstName:'Ada',code:'482193',expiresInMinutes:10});
    expect(email.subject).toContain('Reset');
    expect(email.html).toContain('482193');
    expect(email.html).toContain('10 minutes');
    expect(email.text).toContain('reset code');
  });
});
