import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";

export const RunMigrationCustomerPayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	migrationInternalId: z.string(),
	migrationRunId: z.string(),
	customerInternalId: z.string(),
	customerId: z.string().nullable(),
});

export type RunMigrationCustomerPayload = z.infer<
	typeof RunMigrationCustomerPayloadSchema
>;
