import { CustomerLicenseRowSchema } from "@autumn/shared";
import type { z } from "zod/v4";

/** The whole customer_licenses row: a license pool on a customer-level product, its seat counters and link. */
export const workerCustomerLicenseSchema = CustomerLicenseRowSchema.strict();

export type WorkerCustomerLicense = z.infer<typeof workerCustomerLicenseSchema>;
