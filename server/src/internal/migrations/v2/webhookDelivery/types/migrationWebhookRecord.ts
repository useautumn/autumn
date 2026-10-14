import { AppEnv } from "@autumn/shared";
import { CustomerPlanChangeSchema } from "@autumn/shared/api/billing/common/customerPlanChange.js";
import { z } from "zod/v4";

export const MigrationWebhookRecordSchema = z.object({
	customerId: z.string(),
	internalCustomerId: z.string(),
	entityId: z.string().nullable(),
	customerProductIds: z.array(z.string()),
	planChanges: z.array(CustomerPlanChangeSchema),
});

export type MigrationWebhookRecord = z.infer<
	typeof MigrationWebhookRecordSchema
>;

export const SendMigrationWebhooksPayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	migrationRunId: z.string(),
	concurrency: z.number().int().min(1),
	eventTypes: z.array(z.string()),
	records: z.array(MigrationWebhookRecordSchema),
});

export type SendMigrationWebhooksPayload = z.infer<
	typeof SendMigrationWebhooksPayloadSchema
>;
