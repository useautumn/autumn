import { AppEnv } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BatchMigrationExecutionPlanSchema } from "@/internal/migrations/v2/batchOperations/types/batchMigrationExecutionPlan.js";
import { PreparedStateSchema } from "@/internal/migrations/v2/prepare/types/index.js";
import { RETRYABLE_MIGRATION_ITEM_RUN_STATUSES } from "@/internal/migrations/v2/run/utils/retryItemStatuses.js";

const ControlsSchema = z
	.object({
		limit: z.number().int().min(1).optional(),
		only: z.array(z.string()).optional(),
		retryItemStatuses: z
			.array(z.enum(RETRYABLE_MIGRATION_ITEM_RUN_STATUSES))
			.optional(),
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

export const RunBatchMigrationChunkPayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	migrationRunId: z.string(),
	chunkIndex: z.number().int().min(0),
	cursor: z.string().optional(),
	migration: PreparedMigrationSnapshotSchema,
	plan: BatchMigrationExecutionPlanSchema,
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
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	migration: RunBatchMigrationChunkPayload["migration"];
	plan: RunBatchMigrationChunkPayload["plan"];
	chunkIndex: number;
	cursor: string | undefined;
}): RunBatchMigrationChunkPayload => ({
	orgId: ctx.org.id,
	env: ctx.env,
	migrationRunId,
	chunkIndex,
	cursor,
	migration,
	plan,
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
