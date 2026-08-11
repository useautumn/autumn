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

export const BatchMigrationExecutionAddLicenseSchema = z.discriminatedUnion(
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

/** One op × one plan-filter-matched product. One field per operation
 * category (batchTransition style). `fromProduct` is authoritative for
 * catalog facts; `scope` is the plan filter's lowered row-level residue —
 * which customer product rows the patch may touch. */
export const BatchMigrationExecutionPatchSchema = z.object({
	opIndex: z.number().int(),
	scope: OperationScopeSchema,
	fromProduct: FullProductWithoutLicensesSchema,
	addEntitlementOps: z.array(BatchMigrationExecutionAddSchema),
	addLicenseEntitlementOps: z
		.array(BatchMigrationExecutionAddLicenseSchema)
		.default([]),
});

/** The immutable, serializable plan chunk tasks execute — computed once at
 * run start, carried in every chunk payload. Only what execution needs. */
export const BatchMigrationExecutionPlanSchema = z.object({
	patches: z.array(BatchMigrationExecutionPatchSchema),
});

export type BatchMigrationExecutionAdd = z.infer<
	typeof BatchMigrationExecutionAddSchema
>;
/** The minted kinds — a removal carries no entitlement to insert. */
export type BatchMigrationExecutionMintedLicense = z.infer<
	typeof BatchMigrationLicenseMintedSchema
> & { kind: "add" | "replace" };

export type BatchMigrationExecutionAddLicense = z.infer<
	typeof BatchMigrationExecutionAddLicenseSchema
>;
export type BatchMigrationExecutionPatch = z.infer<
	typeof BatchMigrationExecutionPatchSchema
>;
export type BatchMigrationExecutionPlan = z.infer<
	typeof BatchMigrationExecutionPlanSchema
>;
