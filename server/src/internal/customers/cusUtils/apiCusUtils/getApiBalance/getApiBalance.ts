import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	CheckExpand,
	CusExpand,
	cusEntsToAdjustment,
	cusEntsToAllowance,
	cusEntsToCurrentBalance,
	cusEntsToMaxPurchase,
	cusEntsToNextResetAt,
	cusEntsToPlanId,
	cusEntsToPrepaidQuantity,
	cusEntsToReset,
	cusEntsToRolloverBalance,
	cusEntsToRolloverGranted,
	cusEntsToRollovers,
	cusEntsToRolloverUsage,
	cusEntsToUsage,
	customerEntitlementToBalancePrice,
	dbToApiFeatureV1,
	expandIncludes,
	type Feature,
	FeatureType,
	getCusEntBalance,
	isUnlimitedCustomerEntitlement,
	nullish,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getUnlimitedAndUsageAllowed } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import type { CusFeatureLegacyData } from "../../../../../../../shared/api/customers/cusFeatures/cusFeatureLegacyData.js";
import {
	getBooleanApiBalance,
	getUnlimitedApiBalance,
} from "./apiBalanceUtils.js";

const getApiBalanceBreakdownItem = ({
	// biome-ignore lint/correctness/noUnusedFunctionParameters: Might need this in the future
	ctx,
	fullCus,
	customerEntitlement,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	customerEntitlement: FullCusEntWithFullCusProduct;
}): ApiBalanceBreakdownV1 => {
	const entityId = fullCus.entity?.id;

	const planId = cusEntsToPlanId({ cusEnts: [customerEntitlement] });

	// Included grant
	const allowance = cusEntsToAllowance({ cusEnts: [customerEntitlement] });
	const adjustment = cusEntsToAdjustment({ cusEnts: [customerEntitlement] });
	const includedGrant = new Decimal(allowance).add(adjustment).toNumber();

	// Prepaid grant
	const prepaidGrant = cusEntsToPrepaidQuantity({
		cusEnts: [customerEntitlement],
		sumAcrossEntities: nullish(entityId),
	});

	// Remaining
	const remaining = cusEntsToCurrentBalance({
		cusEnts: [customerEntitlement],
		entityId,
	});

	// Usage
	const usage = cusEntsToUsage({ cusEnts: [customerEntitlement], entityId });

	// Unlimited
	const unlimited = isUnlimitedCustomerEntitlement(customerEntitlement);

	// Reset
	const reset = cusEntsToReset({ cusEnts: [customerEntitlement] });

	// Price
	const price = customerEntitlementToBalancePrice({ customerEntitlement });

	const expiresAt = customerEntitlement.expires_at;

	return {
		id: customerEntitlement.id,
		plan_id: planId,

		included_grant: includedGrant,
		prepaid_grant: prepaidGrant,
		remaining: remaining,
		usage: usage,
		unlimited: unlimited,

		reset: reset,
		price: price,
		expires_at: expiresAt,
	};
};

export const getApiBalance = ({
	ctx,
	fullCus,
	cusEnts,
	feature,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
}): { data: ApiBalanceV1; legacyData?: CusFeatureLegacyData } => {
	const entityId = fullCus.entity?.id;

	const apiFeature = expandIncludes({
		expand: ctx.expand,
		includes: [CheckExpand.BalanceFeature, CusExpand.BalancesFeature],
	})
		? dbToApiFeatureV1({ dbFeature: feature })
		: undefined;

	// 1. If feature is boolean
	if (feature.type === FeatureType.Boolean) {
		return {
			data: getBooleanApiBalance({
				cusEnts,
				apiFeature,
			}),
			legacyData: undefined,
		};
	}

	const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
		cusEnts: cusEnts,
		internalFeatureId: feature.internal_id,
		includeUsageLimit: false,
	});

	// 2. If feature is unlimited
	if (unlimited) {
		return {
			data: getUnlimitedApiBalance({ apiFeature, cusEnts }),
			legacyData: undefined,
		};
	}

	const totalUnused = sumValues(
		cusEnts.map((cusEnt) => {
			const { unused } = getCusEntBalance({ cusEnt, entityId });
			return unused;
		}),
	);

	const breakdownItems = cusEnts.map((cusEnt) =>
		getApiBalanceBreakdownItem({ ctx, fullCus, customerEntitlement: cusEnt }),
	);

	const totalGranted = sumValues(
		breakdownItems.map((item) =>
			new Decimal(item.included_grant).add(item.prepaid_grant).toNumber(),
		),
	);

	const totalUsage = sumValues(breakdownItems.map((item) => item.usage));

	const totalRemaining = sumValues(
		breakdownItems.map((item) => item.remaining),
	);

	const totalMaxPurchase = cusEntsToMaxPurchase({ cusEnts, entityId });

	const nextResetAt = cusEntsToNextResetAt({ cusEnts });

	const totalRollovers = cusEntsToRollovers({ cusEnts, entityId });
	const totalRolloverGranted = cusEntsToRolloverGranted({ cusEnts, entityId });
	const totalRolloverBalance = cusEntsToRolloverBalance({ cusEnts, entityId });
	const totalRolloverUsage = cusEntsToRolloverUsage({ cusEnts, entityId });

	return {
		data: {
			feature_id: feature.id,

			granted: new Decimal(totalGranted).add(totalRolloverGranted).toNumber(),

			remaining: new Decimal(totalRemaining)
				.add(totalRolloverBalance)
				.add(totalUnused)
				.toNumber(),

			usage: new Decimal(totalUsage).add(totalRolloverUsage).toNumber(),

			unlimited: unlimited,
			overage_allowed: usageAllowed,

			max_purchase: totalMaxPurchase,
			next_reset_at: nextResetAt,

			breakdown: breakdownItems,
			rollovers: totalRollovers,
		},
		legacyData: undefined,
	};
};
