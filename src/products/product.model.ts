export enum ProductStatus { Active='active', Pending='pending', Rejected='rejected', Archived='archived' }
import { SubmittedByIdentity } from '../common/request-context';
export interface Product {
  id: string; organizationId: string; name: string; description: string; form: string;
  manufacturer: string; imageUrl?: string | null; verificationDocumentUrl?: string | null;
  status: ProductStatus; statusBeforeArchive?:ProductStatus|null; rejectionReason?: string; totalCodes: number; scanned: number;
  suspicious: number; createdBy: string; submittedBy?: SubmittedByIdentity | null; approvedBy?: SubmittedByIdentity | null; createdAt: Date; updatedAt: Date;
}
