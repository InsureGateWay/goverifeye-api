export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const BRAND_GREEN = '#129136';
const supportEmail = () => process.env.EMAIL_SUPPORT_ADDRESS ?? process.env.OUTLOOK_FROM_EMAIL ?? '';

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function layout(options: { preheader: string; heading: string; body: string; action?: { label: string; url: string }; notice?: string }) {
  const support = supportEmail()
    ? `Need help? Contact <a href="mailto:${escapeHtml(supportEmail())}" style="color:${BRAND_GREEN};text-decoration:none">${escapeHtml(supportEmail())}</a>.`
    : 'Need help? Contact your goVerifEye administrator.';
  const action = options.action
    ? `<tr><td style="padding:8px 40px 30px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="${BRAND_GREEN}" style="border-radius:8px"><a href="${escapeHtml(options.action.url)}" style="display:inline-block;padding:14px 24px;color:#fff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px">${escapeHtml(options.action.label)}</a></td></tr></table></td></tr>`
    : '';
  const notice = options.notice
    ? `<tr><td style="padding:0 40px 30px"><div style="padding:16px 18px;background:#f0f9f2;border-left:4px solid ${BRAND_GREEN};border-radius:6px;color:#31443a;font-size:14px;line-height:21px">${options.notice}</div></td></tr>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f7f5;font-family:Arial,'Helvetica Neue',sans-serif;color:#17251d">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f5"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e1e9e4;border-radius:12px;overflow:hidden">
<tr><td style="padding:26px 40px;background:#0d2918;border-bottom:4px solid ${BRAND_GREEN}"><div style="font-size:25px;font-weight:800;letter-spacing:-.5px;color:#fff">go<span style="color:#45c96a">Verif</span>Eye</div><div style="margin-top:5px;color:#b8d5c1;font-size:12px;letter-spacing:.6px;text-transform:uppercase">Verify with confidence</div></td></tr>
<tr><td style="padding:38px 40px 18px"><h1 style="margin:0;font-size:27px;line-height:35px;color:#132d1c">${escapeHtml(options.heading)}</h1></td></tr>
<tr><td style="padding:0 40px 24px;font-size:16px;line-height:25px;color:#44544a">${options.body}</td></tr>
${notice}${action}
<tr><td style="padding:24px 40px;background:#f8faf8;border-top:1px solid #e6ece8;color:#718078;font-size:12px;line-height:19px">${support}<br><br>&copy; ${new Date().getFullYear()} goVerifEye. This is an automated service email.</td></tr>
</table></td></tr></table></body></html>`;
}

export function verificationCodeEmail(code: string, expiresInMinutes: number): EmailContent {
  return {
    subject: 'Your goVerifEye verification code',
    text: `Your goVerifEye verification code is ${code}. It expires in ${expiresInMinutes} minutes. Do not share this code with anyone.`,
    html: layout({
      preheader: `${code} is your goVerifEye verification code.`,
      heading: 'Verify your email address',
      body: `<p style="margin:0 0 18px">Enter this verification code to continue setting up your account:</p><div style="padding:18px;text-align:center;background:#f4f7f5;border:1px solid #dce7df;border-radius:8px;font-size:32px;font-weight:800;letter-spacing:8px;color:#132d1c">${escapeHtml(code)}</div>`,
      notice: `This code expires in <strong>${expiresInMinutes} minutes</strong>. For your security, never share it with anyone.`,
    }),
  };
}

export function invitationEmail(input: { firstName?: string; role?: string; invitationUrl: string; expiresInDays: number; resent?: boolean }): EmailContent {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hello,';
  const roleText = input.role ? ` as ${input.role}` : '';
  return {
    subject: input.resent ? 'Your goVerifEye invitation' : 'You are invited to goVerifEye',
    text: `${greeting} You have been invited to join goVerifEye${roleText}. Accept your invitation: ${input.invitationUrl}. This link expires in ${input.expiresInDays} days.`,
    html: layout({
      preheader: 'You have been invited to join goVerifEye.',
      heading: input.resent ? 'Your invitation is ready' : 'You’re invited to goVerifEye',
      body: `<p style="margin:0 0 14px">${escapeHtml(greeting)}</p><p style="margin:0">You have been invited to join goVerifEye${escapeHtml(roleText)}. Use the button below to create your account and get started.</p>`,
      action: { label: 'Accept invitation', url: input.invitationUrl },
      notice: `This secure invitation expires in <strong>${input.expiresInDays} days</strong>. If you were not expecting it, you can safely ignore this email.`,
    }),
  };
}
