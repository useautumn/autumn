import {
	EntitlementWithFeatureSchema,
	FullProductWithoutLicensesSchema,
	type PlanItemFilter,
} from "@autumn/shared";
import { z } from "zod/v4";
import { OperationScopeSchema } from "../scope/operationScope.js";

export const BatchMigrationInitialStateSchema = z.object({
	granted: z.number(),
	tracksBalance: z.boolean(),
	unlimited: z.boolean().nullable(),
});

export const BatchMigrationExecutionAddSchema = z.object({
	entitlement: EntitlementWithFeatureSchema,
	initialState: BatchMigrationInitialStateSchema,
});

const BatchMigrationLicenseOpBaseSchema = z.object({
	licensePlanId: z.string(),
	planLicenseId: z.string(),
	licenseInternalProductId: z.string(),
	isOneOff: z.boolean(),
});

const BatchMigrationLicenseMintedSchema =
	BatchMigrationLicenseOpBaseSchema.extend({
		entitlement: EntitlementWithFeatureSchema,
		initialState: BatchMigrationInitialStateSchema,
	});

export const BatchMigrationExecutionLicenseOpSchema = z.discriminatedUnion(
	"kind",
	[
		BatchMigrationLicenseMintedSchema.extend({ kind: z.literal("add") }),
		BatchMigrationLicenseMintedSchema.extend({
			kind: z.literal("replace"),
			fromEntitlementId: z.string(),
		}),
		BatchMigrationLicenseOpBaseSchema.extend({
			kind: z.literal("remove"),
			filter: z.custom<PlanItemFilter>(),
		}),
	],
);

export const BatchMigrationExecutionPatchSchema = z.object({
	opIndex: z.number().int(),
	scope: OperationScopeSchema,
	fromProduct: FullProductWithoutLicensesSchema,
	addEntitlementOps: z.array(BatchMigrationExecutionAddSchema),
	addLicenseEntitlementOps: z
		.array(BatchMigrationExecutionLicenseOpSchema)
		.default([]),
});

export const BatchMigrationExecutionPlanSchema = z.object({
	patches: z.array(BatchMigrationExecutionPatchSchema),
});

export type BatchMigrationExecutionAdd = z.infer<
	typeof BatchMigrationExecutionAddSchema
>;
export type BatchMigrationMintedLicenseOp = z.infer<
	typeof BatchMigrationLicenseMintedSchema
> & { kind: "add" | "replace" };

export type BatchMigrationExecutionLicenseOp = z.infer<
	typeof BatchMigrationExecutionLicenseOpSchema
>;
export type BatchMigrationExecutionPatch = z.infer<
	typeof BatchMigrationExecutionPatchSchema
>;
export type BatchMigrationExecutionPlan = z.infer<
	typeof BatchMigrationExecutionPlanSchema
>;
