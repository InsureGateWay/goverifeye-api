export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/** Portal dual primaries — keep in sync with FE tokens. */
const ACTION_BLUE = '#0b66c3';
const ACTION_BLUE_HOVER = '#0958a8';
const BRAND_GREEN = '#0b6f31';
const BRAND_GREEN_BRIGHT = '#129136';
const PAGE_BG = '#eef4fb';
const CARD_BORDER = '#d7e3f0';
const TEXT_PRIMARY = '#0f1b2d';
const TEXT_BODY = '#3d4f63';
const TEXT_MUTED = '#6b7c90';
const SURFACE_SOFT = '#f5f9fd';
const NOTICE_BG = '#eef7f1';

const supportEmail = () =>
  process.env.EMAIL_SUPPORT_ADDRESS ?? process.env.SMTP_FROM_EMAIL ?? '';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function displayName(firstName?: string) {
  const raw = firstName?.trim();
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function roleLabel(role?: string) {
  if (!role) return '';
  const value = role.trim().toLowerCase();
  if (value === 'admin') return 'Vendor Admin';
  if (value === 'staff') return 'Staff';
  if (value === 'platform_admin') return 'Platform Admin';
  return role.trim();
}

function layout(options: {
  preheader: string;
  heading: string;
  body: string;
  action?: { label: string; url: string };
  notice?: string;
  eyebrow?: string;
}) {
  const support = supportEmail()
    ? `Need help? Contact <a href="mailto:${escapeHtml(supportEmail())}" style="color:${ACTION_BLUE};text-decoration:none;font-weight:600">${escapeHtml(supportEmail())}</a>.`
    : 'Need help? Contact your goVerifEye administrator.';

  const action = options.action
    ? `<tr><td style="padding:4px 40px 32px">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%"><tr>
          <td align="left">
            <a href="${escapeHtml(options.action.url)}" style="display:inline-block;padding:14px 28px;background:linear-gradient(180deg,${ACTION_BLUE} 0%,${ACTION_BLUE_HOVER} 100%);background-color:${ACTION_BLUE};color:#ffffff;font-size:15px;font-weight:700;line-height:20px;text-decoration:none;border-radius:10px;letter-spacing:0.2px;box-shadow:0 8px 20px rgba(11,102,195,0.28)">${escapeHtml(options.action.label)}</a>
          </td>
        </tr></table>
      </td></tr>`
    : '';

  const notice = options.notice
    ? `<tr><td style="padding:0 40px 28px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${NOTICE_BG};border:1px solid #cfe8d8;border-radius:12px">
          <tr>
            <td width="4" style="background:${BRAND_GREEN_BRIGHT};border-radius:12px 0 0 12px;font-size:0;line-height:0">&nbsp;</td>
            <td style="padding:14px 16px;color:${TEXT_BODY};font-size:13px;line-height:20px">${options.notice}</td>
          </tr>
        </table>
      </td></tr>`
    : '';

  const eyebrow = options.eyebrow
    ? `<div style="margin:0 0 10px;color:${ACTION_BLUE};font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase">${escapeHtml(options.eyebrow)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT_PRIMARY}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(options.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PAGE_BG}">
    <tr>
      <td align="center" style="padding:36px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:separate">
          <tr>
            <td style="background:#ffffff;border:1px solid ${CARD_BORDER};border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(15,40,80,0.08)">
              <!-- Brand header -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:0;background:linear-gradient(135deg,#0a3d72 0%,${ACTION_BLUE} 48%,${BRAND_GREEN} 100%);background-color:${ACTION_BLUE}">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:28px 40px 24px">
                          <div style="font-size:26px;font-weight:800;letter-spacing:-0.6px;color:#ffffff;line-height:1">
                            go<span style="color:#8dffb0">Verif</span>Eye
                          </div>
                          <div style="margin-top:8px;color:rgba(255,255,255,0.82);font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase">
                            Verify with confidence
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="height:4px;background:linear-gradient(90deg,${BRAND_GREEN_BRIGHT},${ACTION_BLUE});font-size:0;line-height:0">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:36px 40px 12px">
                    ${eyebrow}
                    <h1 style="margin:0;font-size:26px;line-height:34px;font-weight:700;letter-spacing:-0.4px;color:${TEXT_PRIMARY}">${escapeHtml(options.heading)}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 40px 24px;font-size:15px;line-height:24px;color:${TEXT_BODY}">
                    ${options.body}
                  </td>
                </tr>
                ${notice}
                ${action}
              </table>

              <!-- Footer -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:22px 40px;background:${SURFACE_SOFT};border-top:1px solid ${CARD_BORDER};color:${TEXT_MUTED};font-size:12px;line-height:18px">
                    ${support}<br><br>
                    &copy; ${new Date().getFullYear()} goVerifEye. This is an automated service email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 8px 0;color:${TEXT_MUTED};font-size:11px;line-height:16px">
              Protecting products. Building consumer trust.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function codeBlock(code: string) {
  return `<div style="margin:4px 0;padding:20px 16px;text-align:center;background:${SURFACE_SOFT};border:1px solid ${CARD_BORDER};border-radius:12px;font-size:30px;font-weight:800;letter-spacing:10px;color:${TEXT_PRIMARY};font-family:'SF Mono',Menlo,Consolas,monospace">${escapeHtml(code)}</div>`;
}

export function verificationCodeEmail(code: string, expiresInMinutes: number): EmailContent {
  return {
    subject: 'Your goVerifEye verification code',
    text: `Your goVerifEye verification code is ${code}. It expires in ${expiresInMinutes} minutes. Do not share this code with anyone.`,
    html: layout({
      preheader: `${code} is your goVerifEye verification code.`,
      eyebrow: 'Security check',
      heading: 'Verify your email address',
      body: `<p style="margin:0 0 18px">Enter this verification code to continue setting up your account:</p>${codeBlock(code)}`,
      notice: `This code expires in <strong>${expiresInMinutes} minutes</strong>. For your security, never share it with anyone.`,
    }),
  };
}

export function invitationEmail(input: {
  firstName?: string;
  role?: string;
  invitationUrl: string;
  expiresInDays: number;
  resent?: boolean;
}): EmailContent {
  const name = displayName(input.firstName);
  const greeting = name ? `Hi ${name},` : 'Hello,';
  const role = roleLabel(input.role);
  const roleText = role ? ` as ${role}` : '';
  const roleBadge = role
    ? `<div style="margin:18px 0 0;display:inline-block;padding:6px 12px;background:#e8f2fc;border:1px solid #c5daf3;border-radius:999px;color:${ACTION_BLUE};font-size:12px;font-weight:700;letter-spacing:0.2px">Role · ${escapeHtml(role)}</div>`
    : '';

  return {
    subject: input.resent ? 'Your goVerifEye invitation' : 'You are invited to goVerifEye',
    text: `${greeting} You have been invited to join goVerifEye${roleText}. Accept your invitation: ${input.invitationUrl}. This link expires in ${input.expiresInDays} days.`,
    html: layout({
      preheader: 'You have been invited to join goVerifEye.',
      eyebrow: input.resent ? 'Invitation reminder' : 'Team invitation',
      heading: input.resent ? 'Your invitation is ready' : 'You’re invited to goVerifEye',
      body: `<p style="margin:0 0 12px;font-size:16px;font-weight:600;color:${TEXT_PRIMARY}">${escapeHtml(greeting)}</p>
<p style="margin:0">You have been invited to join goVerifEye${escapeHtml(roleText)}. Create your secure password to access your organization workspace and get started.</p>
${roleBadge}`,
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
  const name = displayName(input.firstName);
  const greeting = name ? `Hi ${name},` : 'Hello,';
  const reviewMessage =
    'Your onboarding information has been submitted for administrator review. We will email you when verification is complete or if anything else is required.';

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
      eyebrow: 'Onboarding received',
      heading: 'Welcome to goVerifEye',
      body: `<p style="margin:0 0 14px;font-size:16px;font-weight:600;color:${TEXT_PRIMARY}">${escapeHtml(greeting)}</p>
<p style="margin:0 0 18px">You have completed onboarding for <strong>${escapeHtml(input.companyName)}</strong>. ${escapeHtml(reviewMessage)}</p>
<h2 style="margin:24px 0 12px;font-size:17px;line-height:24px;color:${TEXT_PRIMARY}">Your next steps</h2>
<ol style="margin:0 0 22px;padding-left:22px;color:${TEXT_BODY}">
  <li style="margin-bottom:9px">Open your dashboard and review your organization profile.</li>
  <li style="margin-bottom:9px">Invite the colleagues who will help manage your account.</li>
  <li style="margin-bottom:9px">Add your products and their supporting information.</li>
  <li>Read the <a href="${escapeHtml(input.userGuideUrl)}" style="color:${ACTION_BLUE};font-weight:700;text-decoration:none">goVerifEye user guide</a>.</li>
</ol>
<p style="margin:0;font-size:13px;line-height:21px;color:${TEXT_MUTED}">By using goVerifEye, you agree to our <a href="${escapeHtml(input.termsUrl)}" style="color:${ACTION_BLUE}">Terms and Conditions</a>. Learn how information is handled in our <a href="${escapeHtml(input.dataUsePolicyUrl)}" style="color:${ACTION_BLUE}">Data Use Policy</a>.</p>`,
      action: { label: 'Go to dashboard', url: input.dashboardUrl },
      notice: escapeHtml(reviewMessage),
    }),
  };
}

export function vendorVerifiedEmail(input: {
  firstName?: string;
  companyName: string;
  dashboardUrl: string;
  userGuideUrl: string;
}): EmailContent {
  const name = displayName(input.firstName);
  const greeting = name ? `Hi ${name},` : 'Hello,';
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
      eyebrow: 'Verified vendor',
      heading: 'Your vendor account is verified',
      body: `<p style="margin:0 0 14px;font-size:16px;font-weight:600;color:${TEXT_PRIMARY}">${escapeHtml(greeting)}</p>
<p style="margin:0 0 18px">Good news — an administrator has verified <strong>${escapeHtml(input.companyName)}</strong>. Your vendor account is now active.</p>
<h2 style="margin:24px 0 12px;font-size:17px;color:${TEXT_PRIMARY}">What to do next</h2>
<ol style="margin:0;padding-left:22px;color:${TEXT_BODY}">
  <li style="margin-bottom:9px">Review your dashboard and organization profile.</li>
  <li style="margin-bottom:9px">Add your products and supporting information.</li>
  <li style="margin-bottom:9px">Invite colleagues who will manage your account.</li>
  <li>Read the <a href="${escapeHtml(input.userGuideUrl)}" style="color:${ACTION_BLUE};font-weight:700;text-decoration:none">user guide</a>.</li>
</ol>`,
      action: { label: 'Open dashboard', url: input.dashboardUrl },
      notice:
        'Verification is complete. You can now use the vendor features available to your organization.',
    }),
  };
}

export function passwordResetCodeEmail(input: {
  firstName?: string;
  code: string;
  expiresInMinutes: number;
}): EmailContent {
  const name = displayName(input.firstName);
  const greeting = name ? `Hi ${name},` : 'Hello,';
  return {
    subject: 'Reset your goVerifEye password',
    text: `${greeting}

We received a request to reset your goVerifEye password.

Your password reset code is: ${input.code}

This single-use link expires in ${input.expiresInMinutes} minutes. If you did not request this, you can safely ignore this email. Your password has not been changed.`,
    html: layout({
      preheader: `${input.code} is your goVerifEye password reset code.`,
      eyebrow: 'Password reset',
      heading: 'Reset your password',
      body: `<p style="margin:0 0 14px;font-size:16px;font-weight:600;color:${TEXT_PRIMARY}">${escapeHtml(greeting)}</p>
<p style="margin:0 0 18px">We received a request to reset your goVerifEye password. Enter this code in the app:</p>
${codeBlock(input.code)}`,
      notice: `This code can be used once and expires in <strong>${input.expiresInMinutes} minutes</strong>. If you did not request this, ignore this email; your password remains unchanged.`,
    }),
  };
}
