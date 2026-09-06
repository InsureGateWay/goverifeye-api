// Canonical transport contract. Run the customer app's contracts:sync after changes.
export type VerificationChannel = 'qr' | 'ocr' | 'manual';
export type VerifyCodeRequestDto = { verificationCode: string; channel?: VerificationChannel; nonce?: string; location?: string; customerComplaint?: string };
export type VerifyCodeResponseDto = {
  valid: boolean; status: string; outcome?: 'valid' | 'suspicious'; risk?: string;
  verificationCount?: number; firstVerification?: boolean; nextNonce?: string; nonceExpiresInSeconds?: number;
  product?: { id: string; name: string; description?: string; form?: string; manufacturer?: string; imageUrl?: string | null };
};
export type CustomerCheckRequestDto = VerifyCodeRequestDto & { requestId: string };
export type CustomerCheckDto = { receipt: string; code: string; channel: VerificationChannel; checkedAt: string; result: VerifyCodeResponseDto };
export type CustomerHistoryDto = { items: CustomerCheckDto[]; page: number; hasMore: boolean };
export type ShopperDto = { id: string; email: string };
export type ShopperChallengeRequestDto = { email: string };
export type ShopperChallengeDto = { challengeId: string; expiresInSeconds: number; message: string };
export type ShopperLoginRequestDto = { challengeId: string; code: string };
export type ShopperSessionDto = { accessToken: string; expiresAt: string; shopper: ShopperDto };
export type ConcernRequestDto = { requestId: string; receipt: string; reason: string; note?: string; photo?: string };
export type ConcernReceiptDto = { id: string; submittedAt: string };
export type ApiErrorDto = { code?: string; title?: string; message?: string | string[]; detail?: string | string[]; status?: number; correlationId?: string };
