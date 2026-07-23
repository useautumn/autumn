import { AppEnv } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { z } from "zod/v4";
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
