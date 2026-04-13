import { getUnlimitedApiBalance } from "@api/customers/cusFeatures/utils/apiBalanceUtils.js";
import {
	type ApiBalanceBreakdownV1,
	type ApiBalanceV1,
	CheckExpand,
	CustomerExpand,
	cusEntsHaveUnlimited,
	cusEntsHaveUsageAllowed,
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
	type FullAggregatedFeatureBalance,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	getCusEntBalance,
	isUnlimitedCusEnt,
	nullish,
	type SharedContext,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	getEmptyApiBalanceV2,
	mergeAggregatedBalanceIntoApiBalanceV2,
} from "./apiBalanceV2Utils.js";

const getApiBalanceBreakdownItemV2 = ({
	fullSubject,
	customerEntitlement,
}: {
	fullSubject: FullSubject;
	customerEntitlement: FullCusEntWithFullCusProduct;
}): ApiBalanceBreakdownV1 => {
	const entityId = fullSubject.entity?.id ?? fullSubject.entity?.internal_id;
	const planId = cusEntsToPlanId({
		cusEnts: [customerEntitlement],
	});
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
	const usage = cusEntsToUsage({
		cusEnts: [customerEntitlement],
		entityId,
	});
	const unlimited = isUnlimitedCusEnt(customerEntitlement);
	const reset = cusEntsToReset({
		cusEnts: [customerEntitlement],
	});
	const price = customerEntitlementToBalancePrice({
		customerEntitlement,
	});
	const overage = cusEntToInvoiceOverage({
		cusEnt: customerEntitlement,
		entityId,
	});
	const apiId = customerEntitlement.external_id ?? customerEntitlement.id;

	return {
		object: "balance_breakdown",
		id: apiId,
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

export const getApiBalanceV2 = ({
	ctx,
	fullSubject,
	customerEntitlements,
	feature,
	aggregatedFeatureBalance,
}: {
	ctx: SharedContext;
	fullSubject: FullSubject;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	feature: Feature;
	aggregatedFeatureBalance?: FullAggregatedFeatureBalance;
}): { data: ApiBalanceV1 } => {
	const entityId = fullSubject.entity?.id ?? fullSubject.entity?.internal_id;

	const apiFeature = expandIncludes({
		expand: ctx.expand,
		includes: [
			CheckExpand.BalanceFeature,
			CustomerExpand.BalancesFeature,
			"feature",
		],
	})
		? dbToApiFeatureV1({
				ctx,
				dbFeature: feature,
			})
		: undefined;

	if (customerEntitlements.length === 0) {
		return {
			data: mergeAggregatedBalanceIntoApiBalanceV2({
				apiBalance: getEmptyApiBalanceV2({
					featureId: feature.id,
					feature: apiFeature,
				}),
				aggregatedFeatureBalance,
			}),
		};
	}

	const unlimited = cusEntsHaveUnlimited({
		cusEnts: customerEntitlements,
		internalFeatureId: feature.internal_id,
	});
	const usageAllowed = cusEntsHaveUsageAllowed({
		cusEnts: customerEntitlements,
		internalFeatureId: feature.internal_id,
		includeUsageLimit: false,
	});

	if (unlimited) {
		return {
			data: mergeAggregatedBalanceIntoApiBalanceV2({
				apiBalance: getUnlimitedApiBalance({
					apiFeature,
					cusEnts: customerEntitlements,
				}),
				aggregatedFeatureBalance,
			}),
		};
	}

	const totalUnused = sumValues(
		customerEntitlements.map((customerEntitlement) => {
			const { unused } = getCusEntBalance({
				cusEnt: customerEntitlement,
				entityId,
			});

			return unused;
		}),
	);
	const breakdownItems = customerEntitlements.map((customerEntitlement) =>
		getApiBalanceBreakdownItemV2({
			fullSubject,
			customerEntitlement,
		}),
	);
	const totalGranted = sumValues(
		breakdownItems.map((breakdownItem) =>
			new Decimal(breakdownItem.included_grant)
				.add(breakdownItem.prepaid_grant)
				.toNumber(),
		),
	);
	const totalUsage = sumValues(
		breakdownItems.map((breakdownItem) => breakdownItem.usage),
	);
	const totalRemaining = sumValues(
		breakdownItems.map((breakdownItem) => breakdownItem.remaining),
	);
	const totalMaxPurchase = cusEntsToMaxPurchase({
		cusEnts: customerEntitlements,
		entityId,
	});
	const nextResetAt = cusEntsToNextResetAt({
		cusEnts: customerEntitlements,
	});
	const totalRollovers = cusEntsToRollovers({
		cusEnts: customerEntitlements,
		entityId,
	});
	const totalRolloverGranted = cusEntsToRolloverGranted({
		cusEnts: customerEntitlements,
		entityId,
	});
	const totalRolloverBalance = cusEntsToRolloverBalance({
		cusEnts: customerEntitlements,
		entityId,
	});
	const totalRolloverUsage = cusEntsToRolloverUsage({
		cusEnts: customerEntitlements,
		entityId,
	});

	return {
		data: mergeAggregatedBalanceIntoApiBalanceV2({
			apiBalance: {
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
			aggregatedFeatureBalance,
		}),
	};
};
