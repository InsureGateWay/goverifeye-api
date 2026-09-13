type SupportEmailInput = {
  reference: string;
  senderEmail: string;
  senderName?: string;
  subject: string;
  message: string;
  attachmentName?: string;
  senderRole?: string;
  organizationName?: string;
  requesterLabel?: 'Customer' | 'Vendor';
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

const messageHtml = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>');

export function customerSupportAdminEmail(input: SupportEmailInput) {
  const requesterLabel = input.requesterLabel ?? 'Customer';
  const sender = input.senderName ? `${input.senderName} <${input.senderEmail}>` : input.senderEmail;
  const attachment = input.attachmentName ? `\nAttachment: ${input.attachmentName}` : '';
  const account = input.organizationName ? `\nOrganization: ${input.organizationName}${input.senderRole ? `\nRole: ${input.senderRole}` : ''}` : '';
  return {
    subject: `[${requesterLabel} support ${input.reference.slice(0, 8)}] ${input.subject}`,
    text: `A ${requesterLabel.toLowerCase()} submitted a support request.\n\nReference: ${input.reference}\nSender: ${sender}${account}\nSubject: ${input.subject}${attachment}\n\nRequest:\n${input.message}`,
    html: `<h1>${requesterLabel} support request</h1><p><strong>Reference:</strong> ${escapeHtml(input.reference)}</p><p><strong>Sender:</strong> ${escapeHtml(sender)}</p>${input.organizationName ? `<p><strong>Organization:</strong> ${escapeHtml(input.organizationName)}</p>` : ''}${input.senderRole ? `<p><strong>Role:</strong> ${escapeHtml(input.senderRole)}</p>` : ''}<p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>${input.attachmentName ? `<p><strong>Attachment:</strong> ${escapeHtml(input.attachmentName)}</p>` : ''}<p><strong>Request:</strong></p><p>${messageHtml(input.message)}</p>`,
  };
}

export function customerSupportReceiptEmail(input: SupportEmailInput) {
  const attachment = input.attachmentName ? `\nAttachment: ${input.attachmentName}` : '';
  return {
    subject: `We received your goVerifEye support request (${input.reference.slice(0, 8)})`,
    text: `We received your support request and sent it to the goVerifEye platform team.\n\nReference: ${input.reference}\nSubject: ${input.subject}${attachment}\n\nYour request:\n${input.message}\n\nKeep this email for your records.`,
    html: `<h1>Support request received</h1><p>We sent your request to the goVerifEye platform team.</p><p><strong>Reference:</strong> ${escapeHtml(input.reference)}</p><p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>${input.attachmentName ? `<p><strong>Attachment:</strong> ${escapeHtml(input.attachmentName)}</p>` : ''}<p><strong>Your request:</strong></p><p>${messageHtml(input.message)}</p><p>Keep this email for your records.</p>`,
  };
}
