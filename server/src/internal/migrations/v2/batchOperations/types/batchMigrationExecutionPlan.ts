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

export const BatchMigrationExecutionRemoveSchema = z.object({
	entitlement: EntitlementWithFeatureSchema,
});

export const BatchMigrationExecutionReplaceSchema = z.object({
	fromEntitlement: EntitlementWithFeatureSchema,
	entitlement: EntitlementWithFeatureSchema,
	initialState: BatchMigrationInitialStateSchema,
});

export const BatchMigrationExecutionRepointProductSchema = z.object({
	fromInternalProductId: z.string(),
	toInternalProductId: z.string(),
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
	"type",
	[
		BatchMigrationLicenseOpBaseSchema.extend({
			type: z.literal("repoint_license_pool"),
		}),
		BatchMigrationLicenseMintedSchema.extend({
			type: z.literal("add_license_entitlement"),
		}),
		BatchMigrationLicenseMintedSchema.extend({
			type: z.literal("replace_license_entitlement"),
			fromEntitlementId: z.string(),
		}),
		BatchMigrationLicenseOpBaseSchema.extend({
			type: z.literal("remove_license_entitlement"),
			filter: z.custom<PlanItemFilter>(),
		}),
	],
);

export const BatchMigrationExecutionPatchSchema = z.object({
	opIndex: z.number().int(),
	scope: OperationScopeSchema,
	fromProduct: FullProductWithoutLicensesSchema,
	toProduct: FullProductWithoutLicensesSchema.optional(),
	addEntitlementOps: z.array(BatchMigrationExecutionAddSchema),
	removeEntitlementOps: z
		.array(BatchMigrationExecutionRemoveSchema)
		.default([]),
	replaceEntitlementOps: z
		.array(BatchMigrationExecutionReplaceSchema)
		.default([]),
	licenseEntitlementOps: z
		.array(BatchMigrationExecutionLicenseOpSchema)
		.default([]),
	repointCustomerProduct:
		BatchMigrationExecutionRepointProductSchema.optional(),
});

export const BatchMigrationExecutionPlanSchema = z.object({
	patches: z.array(BatchMigrationExecutionPatchSchema),
});

export type BatchMigrationExecutionAdd = z.infer<
	typeof BatchMigrationExecutionAddSchema
>;
export type BatchMigrationExecutionRemove = z.infer<
	typeof BatchMigrationExecutionRemoveSchema
>;
export type BatchMigrationExecutionReplace = z.infer<
	typeof BatchMigrationExecutionReplaceSchema
>;
export type BatchMigrationMintedLicenseOp = z.infer<
	typeof BatchMigrationLicenseMintedSchema
> & { type: "add_license_entitlement" | "replace_license_entitlement" };

export type BatchMigrationExecutionLicenseOp = z.infer<
	typeof BatchMigrationExecutionLicenseOpSchema
>;
export type BatchMigrationExecutionPatch = z.infer<
	typeof BatchMigrationExecutionPatchSchema
>;
export type BatchMigrationExecutionPlan = z.infer<
	typeof BatchMigrationExecutionPlanSchema
>;
