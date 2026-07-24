import { invitationEmail, verificationCodeEmail } from './email-templates';

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
});
