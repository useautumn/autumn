import { EntitlementWithFeatureSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { EntitlementPriceFilterSchema } from "./entitlementPriceFilter.js";

export const BatchMigrationInitialStateSchema = z.object({
	granted: z.number(),
	tracksBalance: z.boolean(),
	unlimited: z.boolean().nullable(),
});

export const BatchMigrationExecutionAddSchema = z.object({
	entitlement: EntitlementWithFeatureSchema,
	initialState: BatchMigrationInitialStateSchema,
});

export const RemoveByFilterSchema = z.object({
	by: z.literal("filter"),
	from: EntitlementPriceFilterSchema,
});

export const BatchMigrationExecutionRemoveSchema = RemoveByFilterSchema;

export const ReplaceByFilterSchema = z.object({
	by: z.literal("filter"),
	from: EntitlementPriceFilterSchema,
	entitlement: EntitlementWithFeatureSchema,
	initialState: BatchMigrationInitialStateSchema,
});

export const BatchMigrationExecutionReplaceSchema = ReplaceByFilterSchema;

export type BatchMigrationExecutionAdd = z.infer<
	typeof BatchMigrationExecutionAddSchema
>;
export type BatchMigrationExecutionRemove = z.infer<
	typeof BatchMigrationExecutionRemoveSchema
>;
export type BatchMigrationExecutionReplace = z.infer<
	typeof BatchMigrationExecutionReplaceSchema
>;
