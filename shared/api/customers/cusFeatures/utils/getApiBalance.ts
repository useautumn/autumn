import {
	type ApiBalanceBreakdownV1,
	type ApiBalanceV1,
	CheckExpand,
	CustomerExpand,
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
	cusEntToInvoiceOverage,
	customerEntitlementToBalancePrice,
	dbToApiFeatureV1,
	expandIncludes,
	type Feature,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	getCusEntBalance,
	isUnlimitedCusEnt,
	nullish,
	type SharedContext,
	sumValues,
} from "@autumn/shared";
import { AllowanceType } from "@models/productModels/entModels/entModels.js";
import { Decimal } from "decimal.js";
import {
	getBooleanApiBalance,
	getUnlimitedApiBalance,
} from "./apiBalanceUtils.js";

const getUnlimitedAndUsageAllowed = ({
	cusEnts,
	internalFeatureId,
	includeUsageLimit = true,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	internalFeatureId: string;
	includeUsageLimit?: boolean;
}) => {
	const unlimited = cusEnts.some(
		(cusEnt) =>
			cusEnt.internal_feature_id === internalFeatureId &&
			(cusEnt.entitlement.allowance_type === AllowanceType.Unlimited ||
				cusEnt.unlimited),
	);

	const usageAllowed = cusEnts.some(
		(cusEnt) =>
			cusEnt.internal_feature_id === internalFeatureId &&
			cusEnt.usage_allowed &&
			(includeUsageLimit ? nullish(cusEnt.entitlement.usage_limit) : true),
	);

	return { unlimited, usageAllowed };
};

const getApiBalanceBreakdownItem = ({
	fullCus,
	customerEntitlement,
}: {
	fullCus: FullCustomer;
	customerEntitlement: FullCusEntWithFullCusProduct;
}): ApiBalanceBreakdownV1 => {
	const entityId = fullCus.entity?.id ?? fullCus.entity?.internal_id;
	const planId = cusEntsToPlanId({ cusEnts: [customerEntitlement] });
	const allowance = cusEntsToAllowance({
		cusEnts: [customerEntitlement],
		entityId,
	});
	const adjustment = cusEntsToAdjustment({
		cusEnts: [customerEntitlement],
		entityId,
	});
	const includedGrant = new Decimal(allowance).add(adjustment).toNumber();
	const prepaidGrant = cusEntsToPrepaidQuantity({
		cusEnts: [customerEntitlement],
		sumAcrossEntities: nullish(entityId),
	});
	const remaining = cusEntsToCurrentBalance({
		cusEnts: [customerEntitlement],
		entityId,
	});
	const usage = cusEntsToUsage({ cusEnts: [customerEntitlement], entityId });
	const unlimited = isUnlimitedCusEnt(customerEntitlement);
	const reset = cusEntsToReset({ cusEnts: [customerEntitlement] });
	const price = customerEntitlementToBalancePrice({ customerEntitlement });
	const overage = cusEntToInvoiceOverage({
		cusEnt: customerEntitlement,
		entityId,
	});

	return {
		object: "balance_breakdown",
		id: customerEntitlement.external_id ?? customerEntitlement.id,
		plan_id: planId,
		included_grant: includedGrant,
		prepaid_grant: prepaidGrant,
		remaining,
		usage,
		unlimited,
		reset,
		price,
		expires_at: customerEntitlement.expires_at,
		overage,
	};
};

export const getApiBalance = ({
	ctx,
	fullCus,
	cusEnts,
	feature,
}: {
	ctx: SharedContext;
	fullCus: FullCustomer;
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
}): { data: ApiBalanceV1 } => {
	const entityId = fullCus.entity?.id ?? fullCus.entity?.internal_id;

	const apiFeature = expandIncludes({
		expand: ctx.expand,
		includes: [CheckExpand.BalanceFeature, CustomerExpand.BalancesFeature],
	})
		? dbToApiFeatureV1({ ctx, dbFeature: feature })
		: undefined;

	if (feature.type === FeatureType.Boolean) {
		return {
			data: getBooleanApiBalance({
				cusEnts,
				apiFeature,
			}),
		};
	}

	const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
		cusEnts,
		internalFeatureId: feature.internal_id,
		includeUsageLimit: false,
	});

	if (unlimited) {
		return {
			data: getUnlimitedApiBalance({ apiFeature, cusEnts }),
		};
	}

	const totalUnused = sumValues(
		cusEnts.map((cusEnt) => {
			const { unused } = getCusEntBalance({ cusEnt, entityId });
			return unused;
		}),
	);

	const breakdownItems = cusEnts.map((cusEnt) =>
		getApiBalanceBreakdownItem({ fullCus, customerEntitlement: cusEnt }),
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
			object: "balance",
			feature_id: feature.id,
			feature: apiFeature,
			granted: new Decimal(totalGranted).add(totalRolloverGranted).toNumber(),
			remaining: new Decimal(totalRemaining)
				.add(totalRolloverBalance)
				.add(totalUnused)
				.toNumber(),
			usage: new Decimal(totalUsage)
				.add(totalRolloverUsage)
				.sub(totalUnused)
				.toNumber(),
			unlimited,
			overage_allowed: usageAllowed ?? false,
			max_purchase: totalMaxPurchase,
			next_reset_at: nextResetAt,
			breakdown: breakdownItems,
			rollovers: totalRollovers,
		},
	};
};
