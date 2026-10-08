import { CustomerLicenseRowSchema } from "@autumn/shared";
import type { z } from "zod/v4";
import { openSchema } from "../../common/openSchema.js";

/** The whole customer_licenses row: a license pool on a customer-level product, its seat counters and link. */
export const workerCustomerLicenseSchema = openSchema({
	name: "workerCustomerLicense",
	schema: CustomerLicenseRowSchema,
});

export type WorkerCustomerLicense = z.infer<typeof workerCustomerLicenseSchema>;
