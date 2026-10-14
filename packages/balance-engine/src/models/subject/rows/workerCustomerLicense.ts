import { CustomerLicenseRowSchema } from "@autumn/shared";
import type { z } from "zod/v4";
import { openSchema } from "../../common/openSchema.js";

export const workerCustomerLicenseSchema = openSchema({
	name: "workerCustomerLicense",
	schema: CustomerLicenseRowSchema,
});

export type WorkerCustomerLicense = z.infer<typeof workerCustomerLicenseSchema>;
