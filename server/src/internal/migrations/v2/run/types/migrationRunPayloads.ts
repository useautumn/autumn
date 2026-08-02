import { AppEnv } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BatchMigrationExecutionPlanSchema } from "@/internal/migrations/v2/batchOperations/types/batchMigrationExecutionPlan.js";
import { PreparedStateSchema } from "@/internal/migrations/v2/prepare/types/index.js";
import { RETRYABLE_MIGRATION_ITEM_RUN_STATUSES } from "@/internal/migrations/v2/run/utils/retryItemStatuses.js";
import { MAX_MIGRATION_WEBHOOK_CONCURRENCY } from "@/internal/migrations/v2/webhookDelivery/webhookDeliveryConstants.js";

/** Operator's request; the run resolves it into MigrationWebhookControls. */
export const WebhookRunParamsSchema = z.object({
	sendWebhooks: z.boolean().optional(),
	webhookConcurrency: z
		.number()
		.int()
		.min(1)
		.max(MAX_MIGRATION_WEBHOOK_CONCURRENCY)
		.optional(),
});

const ControlsSchema = z
	.object({
		limit: z.number().int().min(1).optional(),
		only: z.array(z.string()).optional(),
		retryItemStatuses: z
			.array(z.enum(RETRYABLE_MIGRATION_ITEM_RUN_STATUSES))
			.optional(),
		webhooks: WebhookRunParamsSchema.optional(),
	})
	.optional();

export const RunMigrationPayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	migrationId: z.string(),
	migrationRunId: z.string(),
	dryRun: z.boolean().default(false),
	lazyRun: z.boolean().default(false),
	controls: ControlsSchema,
});

export type RunMigrationPayload = z.infer<typeof RunMigrationPayloadSchema>;

export const PreparedMigrationSnapshotSchema = z.object({
	internal_id: z.string(),
	id: z.string(),
	org_id: z.string(),
	env: z.enum(AppEnv),
	filter: MigrationFilterSchema.nullable(),
	operations: OperationsSchema.nullable(),
	prepared_state: PreparedStateSchema,
	no_billing_changes: z.boolean().nullable(),
	retry_failed: z.boolean(),
	archived: z.boolean(),
	created_at: z.number(),
	updated_at: z.number().nullable(),
	event_internal_id: z.string(),
});

export const RunMigrationChunkPayloadSchema = RunMigrationPayloadSchema.extend({
	chunkIndex: z.number().int().min(0),
	cursor: z.string().optional(),
	migration: PreparedMigrationSnapshotSchema,
});

export type RunMigrationChunkPayload = z.infer<
	typeof RunMigrationChunkPayloadSchema
>;

/** Resolved once at run start, then carried per chunk so every task delivers
 * exactly what the run resolved. */
export const WebhookControlsSchema = z.object({
	sendWebhooks: z.boolean(),
	webhookConcurrency: z.number().int().min(0),
	eventTypes: z.array(z.string()),
});

export const RunBatchMigrationChunkPayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	migrationRunId: z.string(),
	chunkIndex: z.number().int().min(0),
	cursor: z.string().optional(),
	migration: PreparedMigrationSnapshotSchema,
	plan: BatchMigrationExecutionPlanSchema,
	webhooks: WebhookControlsSchema.optional(),
	/** Claim-time controls (only / retryItemStatuses) — never lane selectors. */
	controls: ControlsSchema,
});

export type RunBatchMigrationChunkPayload = z.infer<
	typeof RunBatchMigrationChunkPayloadSchema
>;

export const buildRunBatchMigrationChunkPayload = ({
	ctx,
	migrationRunId,
	migration,
	plan,
	chunkIndex,
	cursor,
	webhooks,
	controls,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	migration: RunBatchMigrationChunkPayload["migration"];
	plan: RunBatchMigrationChunkPayload["plan"];
	chunkIndex: number;
	cursor: string | undefined;
	webhooks?: RunBatchMigrationChunkPayload["webhooks"];
	controls?: RunBatchMigrationChunkPayload["controls"];
}): RunBatchMigrationChunkPayload => ({
	orgId: ctx.org.id,
	env: ctx.env,
	migrationRunId,
	chunkIndex,
	cursor,
	migration,
	plan,
	webhooks,
	controls,
});

/** Assembles one chunk payload; the iterator's remaining `limit` overrides
 * controls.limit so later chunks only process what's left of the budget. */
export const buildRunMigrationChunkPayload = ({
	ctx,
	migrationId,
	migrationRunId,
	dryRun,
	lazyRun,
	migration,
	controls,
	limit,
	chunkIndex,
	cursor,
}: {
	ctx: AutumnContext;
	migrationId: string;
	migrationRunId: string;
	dryRun: boolean;
	lazyRun: boolean;
	migration: RunMigrationChunkPayload["migration"];
	controls: RunMigrationPayload["controls"];
	limit: number | undefined;
	chunkIndex: number;
	cursor: string | undefined;
}): RunMigrationChunkPayload => ({
	orgId: ctx.org.id,
	env: ctx.env,
	migrationId,
	migrationRunId,
	dryRun,
	lazyRun,
	chunkIndex,
	cursor,
	migration,
	controls: {
		...(controls ?? {}),
		...(limit === undefined ? {} : { limit }),
	},
});
