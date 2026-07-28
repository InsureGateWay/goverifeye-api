export enum ProductStatus { Active='active', Pending='pending', Rejected='rejected', Archived='archived' }
export interface Product {
  id: string; organizationId: string; name: string; description: string; form: string;
  manufacturer: string; imageUrl?: string; verificationDocumentUrl?: string;
  status: ProductStatus; statusBeforeArchive?:ProductStatus|null; rejectionReason?: string; totalCodes: number; scanned: number;
  suspicious: number; createdBy: string; createdAt: Date; updatedAt: Date;
}
