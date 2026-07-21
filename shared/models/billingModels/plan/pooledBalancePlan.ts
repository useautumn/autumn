import { z } from "zod/v4";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";
import { RolloverConfigSchema } from "../../productV2Models/productItemModels/productItemModels.js";

const PooledBalanceSourceSchema = z.object({
	internalCustomerId: z.string(),
	sourceCustomerProductId: z.string(),
});

export const PooledBalanceUsageReapplySchema = z.object({
	amount: z.number().positive(),
	excludedSourceCustomerProductId: z.string(),
});

export const UpsertPooledBalanceSourceSchema = PooledBalanceSourceSchema.extend(
	{
		featureId: z.string(),
		internalFeatureId: z.string(),
		interval: z.nativeEnum(EntInterval),
		intervalCount: z.number().int().positive(),
		resetCycleAnchor: z.number().nullable(),
		nextResetAt: z.number().nullable(),
		rollover: RolloverConfigSchema.nullish().default(null),
		stripeSubscriptionId: z.string().nullable(),
		customerLicenseLinkId: z.string().nullable(),
		sourceEntitlementId: z.string(),
		currentCycleContribution: z.number().nonnegative(),
		nextCycleContribution: z.number().nonnegative(),
		usageReapply: PooledBalanceUsageReapplySchema.optional(),
	},
);

export const UpsertPooledBalanceSourceOpSchema =
	UpsertPooledBalanceSourceSchema.extend({
		op: z.literal("upsert_source"),
	});

export const RemovePooledBalanceSourceSchema = PooledBalanceSourceSchema.extend(
	{
		effectiveAt: z.number().nullable(),
	},
);

export const RemovePooledBalanceSourceOpSchema =
	RemovePooledBalanceSourceSchema.extend({
		op: z.literal("remove_source"),
	});

export const RemovePooledBalanceContributionOpSchema =
	PooledBalanceSourceSchema.extend({
		op: z.literal("remove_contribution"),
		sourceEntitlementId: z.string(),
		effectiveAt: z.number().nullable(),
	});

export const RestorePooledBalanceSourceOpSchema =
	PooledBalanceSourceSchema.extend({
		op: z.literal("restore_source"),
		expectedEffectiveAt: z.number(),
	});

const PooledBalanceOwnerSchema = z.object({
	internalCustomerId: z.string(),
	customerLicenseLinkId: z.string(),
});

export const StagePooledBalanceOwnerRemovalOpSchema =
	PooledBalanceOwnerSchema.extend({
		op: z.literal("stage_owner_removal"),
		effectiveAt: z.number(),
	});

export const RestorePooledBalanceOwnerOpSchema =
	PooledBalanceOwnerSchema.extend({
		op: z.literal("restore_owner"),
		expectedEffectiveAt: z.number(),
	});

export const TransferPooledBalanceSourceOpSchema =
	UpsertPooledBalanceSourceSchema.omit({
		usageReapply: true,
	}).extend({
		op: z.literal("transfer_source"),
		contributionId: z.string(),
		expectedPooledBalanceId: z.string(),
	});

export const PooledBalanceIdentitySchema = z.object({
	featureId: z.string(),
	internalFeatureId: z.string(),
	interval: z.enum(EntInterval),
	intervalCount: z.number().int().positive(),
	resetCycleAnchor: z.number().nullable(),
	nextResetAt: z.number().nullable(),
	rollover: RolloverConfigSchema.nullish().default(null),
});

export const PooledContributionSpecSchema = z.object({
	sourceCustomerProductId: z.string(),
	sourceEntitlementId: z.string(),
	stripeSubscriptionId: z.string().nullable(),
	customerLicenseLinkId: z.string().nullable(),
	currentCycleContribution: z.number().nonnegative(),
	nextCycleContribution: z.number().nonnegative(),
});

export const UpsertPooledBalanceSourceSpecSchema = z.object({
	internalCustomerId: z.string(),
	pooledBalance: PooledBalanceIdentitySchema,
	contribution: PooledContributionSpecSchema,
	usageCarry: PooledBalanceUsageReapplySchema.optional(),
});

export const PooledBalanceOpSchema = z.discriminatedUnion("op", [
	UpsertPooledBalanceSourceOpSchema,
	RemovePooledBalanceSourceOpSchema,
	RemovePooledBalanceContributionOpSchema,
	RestorePooledBalanceSourceOpSchema,
	StagePooledBalanceOwnerRemovalOpSchema,
	RestorePooledBalanceOwnerOpSchema,
	TransferPooledBalanceSourceOpSchema,
]);

export type PooledBalanceOp = z.infer<typeof PooledBalanceOpSchema>;
export type PooledBalanceUsageReapply = z.infer<
	typeof PooledBalanceUsageReapplySchema
>;

export const PooledBalancePlanSchema = z.object({
	removeSources: z.array(RemovePooledBalanceSourceSchema).optional(),
	upsertSources: z.array(UpsertPooledBalanceSourceSpecSchema).optional(),
});

export type PooledBalancePlan = z.infer<typeof PooledBalancePlanSchema>;
export type RemovePooledBalanceSource = z.infer<
	typeof RemovePooledBalanceSourceSchema
>;
export type UpsertPooledBalanceSource = z.infer<
	typeof UpsertPooledBalanceSourceSchema
>;
export type PooledBalanceIdentity = z.infer<typeof PooledBalanceIdentitySchema>;
export type PooledContributionSpec = z.infer<
	typeof PooledContributionSpecSchema
>;
export type UpsertPooledBalanceSourceSpec = z.infer<
	typeof UpsertPooledBalanceSourceSpecSchema
>;
