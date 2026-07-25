export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const BRAND_GREEN = '#129136';
const supportEmail = () => process.env.EMAIL_SUPPORT_ADDRESS ?? process.env.SMTP_FROM_EMAIL ?? '';

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

export function vendorOnboardingSubmittedEmail(input: {
  firstName?: string;
  companyName: string;
  dashboardUrl: string;
  termsUrl: string;
  userGuideUrl: string;
  dataUsePolicyUrl: string;
}): EmailContent {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hello,';
  const reviewMessage = 'Your onboarding information has been submitted for administrator review. We will email you when verification is complete or if anything else is required.';

  return {
    subject: `We received your goVerifEye onboarding, ${input.companyName}`,
    text: `${greeting}

Welcome to goVerifEye. You have completed onboarding for ${input.companyName}. ${reviewMessage}

Next steps:
1. Open your dashboard: ${input.dashboardUrl}
2. Complete your organization profile and invite your team.
3. Add your products and supporting product information.
4. Review the user guide: ${input.userGuideUrl}

Terms and Conditions: ${input.termsUrl}
Data Use Policy: ${input.dataUsePolicyUrl}`,
    html: layout({
      preheader: `Onboarding is complete for ${input.companyName}.`,
      heading: 'Welcome to goVerifEye',
      body: `<p style="margin:0 0 14px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 18px">You have completed onboarding for <strong>${escapeHtml(input.companyName)}</strong>. ${escapeHtml(reviewMessage)}</p>
<h2 style="margin:24px 0 12px;font-size:19px;line-height:26px;color:#132d1c">Your next steps</h2>
<ol style="margin:0 0 22px;padding-left:22px">
  <li style="margin-bottom:9px">Open your dashboard and review your organization profile.</li>
  <li style="margin-bottom:9px">Invite the colleagues who will help manage your account.</li>
  <li style="margin-bottom:9px">Add your products and their supporting information.</li>
  <li>Read the <a href="${escapeHtml(input.userGuideUrl)}" style="color:${BRAND_GREEN};font-weight:700">goVerifEye user guide</a>.</li>
</ol>
<p style="margin:0;font-size:14px;line-height:22px">By using goVerifEye, you agree to our <a href="${escapeHtml(input.termsUrl)}" style="color:${BRAND_GREEN}">Terms and Conditions</a>. Learn how information is handled in our <a href="${escapeHtml(input.dataUsePolicyUrl)}" style="color:${BRAND_GREEN}">Data Use Policy</a>.</p>`,
      action: { label: 'Go to dashboard', url: input.dashboardUrl },
      notice: escapeHtml(reviewMessage),
    }),
  };
}

export function vendorVerifiedEmail(input: { firstName?: string; companyName: string; dashboardUrl: string; userGuideUrl: string }): EmailContent {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hello,';
  return {
    subject: `${input.companyName} has been verified on goVerifEye`,
    text: `${greeting}

Good news — an administrator has verified ${input.companyName}. Your vendor account is now active.

Next steps:
1. Open your dashboard: ${input.dashboardUrl}
2. Add your products and supporting information.
3. Invite your team.
4. Read the user guide: ${input.userGuideUrl}`,
    html: layout({
      preheader: `${input.companyName} is now verified on goVerifEye.`,
      heading: 'Your vendor account is verified',
      body: `<p style="margin:0 0 14px">${escapeHtml(greeting)}</p><p style="margin:0 0 18px">Good news — an administrator has verified <strong>${escapeHtml(input.companyName)}</strong>. Your vendor account is now active.</p><h2 style="margin:24px 0 12px;font-size:19px;color:#132d1c">What to do next</h2><ol style="margin:0;padding-left:22px"><li style="margin-bottom:9px">Review your dashboard and organization profile.</li><li style="margin-bottom:9px">Add your products and supporting information.</li><li style="margin-bottom:9px">Invite colleagues who will manage your account.</li><li>Read the <a href="${escapeHtml(input.userGuideUrl)}" style="color:${BRAND_GREEN};font-weight:700">user guide</a>.</li></ol>`,
      action: { label: 'Open dashboard', url: input.dashboardUrl },
      notice: 'Verification is complete. You can now use the vendor features available to your organization.',
    }),
  };
}

export function passwordResetCodeEmail(input: { firstName?: string; code: string; expiresInMinutes: number }): EmailContent {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hello,';
  return {
    subject: 'Reset your goVerifEye password',
    text: `${greeting}

We received a request to reset your goVerifEye password.

Your password reset code is: ${input.code}

This single-use link expires in ${input.expiresInMinutes} minutes. If you did not request this, you can safely ignore this email. Your password has not been changed.`,
    html: layout({
      preheader: `${input.code} is your goVerifEye password reset code.`,
      heading: 'Reset your password',
      body: `<p style="margin:0 0 14px">${escapeHtml(greeting)}</p><p style="margin:0 0 18px">We received a request to reset your goVerifEye password. Enter this code in the app:</p><div style="padding:18px;text-align:center;background:#f4f7f5;border:1px solid #dce7df;border-radius:8px;font-size:32px;font-weight:800;letter-spacing:8px;color:#132d1c">${escapeHtml(input.code)}</div>`,
      notice: `This code can be used once and expires in <strong>${input.expiresInMinutes} minutes</strong>. If you did not request this, ignore this email; your password remains unchanged.`,
    }),
  };
}
