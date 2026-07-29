import { EntitlementWithFeatureSchema } from "@autumn/shared";
import { z } from "zod/v4";

export const BatchMigrationInitialStateSchema = z.object({
	granted: z.number(),
	tracksBalance: z.boolean(),
	unlimited: z.boolean().nullable(),
});

export const BatchMigrationExecutionAddSchema = z.object({
	entitlement: EntitlementWithFeatureSchema,
	initialState: BatchMigrationInitialStateSchema,
});

/** One op × one plan-filter-matched product: the scope every operation
 * executes against. One field per operation category (batchTransition style). */
export const BatchMigrationExecutionPatchSchema = z.object({
	opIndex: z.number().int(),
	planId: z.string(),
	fromInternalProductId: z.string(),
	addEntitlementOps: z.array(BatchMigrationExecutionAddSchema),
});

/** The immutable, serializable plan chunk tasks execute — computed once at
 * run start, carried in every chunk payload. Only what execution needs. */
export const BatchMigrationExecutionPlanSchema = z.object({
	patches: z.array(BatchMigrationExecutionPatchSchema),
});

export type BatchMigrationExecutionAdd = z.infer<
	typeof BatchMigrationExecutionAddSchema
>;
export type BatchMigrationExecutionPatch = z.infer<
	typeof BatchMigrationExecutionPatchSchema
>;
export type BatchMigrationExecutionPlan = z.infer<
	typeof BatchMigrationExecutionPlanSchema
>;
