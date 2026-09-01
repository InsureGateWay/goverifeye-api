import { DomainError } from '../common/domain-error';
import { EmailTemplateService } from './email-template.service';

describe('EmailTemplateService', () => {
  const service = new EmailTemplateService({} as never);
  const template = {
    subjectTemplate: 'Welcome {{firstName}}\r\nBcc: attacker@example.com',
    textTemplate: 'Hello {{firstName}}, use {{code}}.',
    htmlTemplate: '<p>Hello {{firstName}}, use <strong>{{code}}</strong>.</p>',
    requiredVariables: ['firstName', 'code'],
  };

  it('renders text and escapes variables inserted into HTML', () => {
    const rendered = service.renderRow(template, {
      firstName: '<Admin & Co>',
      code: '123456',
    });

    expect(rendered.subject).toBe('Welcome <Admin & Co> Bcc: attacker@example.com');
    expect(rendered.text).toBe('Hello <Admin & Co>, use 123456.');
    expect(rendered.html).toContain('Hello &lt;Admin &amp; Co&gt;');
  });

  it('rejects a render when a required variable is missing', () => {
    expect(() => service.renderRow(template, { firstName: 'Ada' })).toThrow(
      DomainError,
    );
  });
});
