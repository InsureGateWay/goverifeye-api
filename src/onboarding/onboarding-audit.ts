import { createHmac } from 'crypto';
import type { Request } from 'express';
import { SubmitOnboardingDto } from './onboarding.dto';

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hash(value: string | undefined) {
  if (!value) return undefined;
  const pepper = process.env.AUDIT_METADATA_PEPPER ?? process.env.CODE_ACTIVATION_PEPPER ?? 'local-audit-pepper';
  return createHmac('sha256', pepper).update(value).digest('hex');
}

export function onboardingAuditMetadata(
  request: Request,
  input: SubmitOnboardingDto,
  previousStatus: string,
  newStatus: string,
  sessionId: string,
) {
  const forwardedIp = firstHeader(request.headers['x-forwarded-for'])?.split(',')[0]?.trim();
  const country =
    firstHeader(request.headers['cf-ipcountry']) ??
    firstHeader(request.headers['x-vercel-ip-country']);

  return {
    completedAt: new Date().toISOString(),
    previousStatus,
    newStatus,
    sessionId,
    ipHash: hash(forwardedIp ?? request.ip),
    userAgentHash: hash(request.get('user-agent')),
    deviceFingerprintHash: hash(firstHeader(request.headers['x-device-fingerprint'])),
    timezone: firstHeader(request.headers['x-client-timezone']),
    locale: firstHeader(request.headers['x-client-locale']),
    country,
    ...(input.latitude !== undefined && input.longitude !== undefined
      ? { location: { latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters } }
      : {}),
    consent: {
      termsAccepted: input.termsAccepted,
      termsVersion: input.termsVersion,
      dataUsePolicyAccepted: input.dataUsePolicyAccepted,
      dataUsePolicyVersion: input.dataUsePolicyVersion,
    },
  };
}
