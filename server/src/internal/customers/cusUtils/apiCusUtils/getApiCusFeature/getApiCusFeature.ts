import type {
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	type ApiCusFeatureBreakdown,
	ApiCusFeatureBreakdownSchema,
	ApiCusFeatureSchema,
	CusExpand,
	cusEntToBalance,
	cusEntToIncludedUsage,
	cusEntToKey,
	cusEntToMaxPurchase,
	type Feature,
	FeatureType,
	getCusEntBalance,
	notNullish,
	sumValues,
	toApiFeature,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getUnlimitedAndUsageAllowed } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import {
	cusEntsToInterval,
	cusEntsToNextResetAt,
	cusEntsToRollovers,
	getBooleanApiCusFeature,
	getUnlimitedApiCusFeature,
} from "./apiCusFeatureUtils.js";

const cusEntsToBreakdown = ({
	ctx,
	fullCus,
	cusEnts,
}: {
	ctx: RequestContext;
	cusEnts: FullCusEntWithFullCusProduct[];
	fullCus: FullCustomer;
}): ApiCusFeatureBreakdown[] | undefined => {
	const keyToCusEnts: Record<string, FullCusEntWithFullCusProduct[]> = {};
	for (const cusEnt of cusEnts) {
		const key = cusEntToKey({ cusEnt });
		keyToCusEnts[key] = [...(keyToCusEnts[key] || []), cusEnt];
	}

	if (Object.keys(keyToCusEnts).length === 1) return undefined;

	const breakdown: ApiCusFeatureBreakdown[] = [];

	for (const key in keyToCusEnts) {
		const cusEnts = keyToCusEnts[key];

		const feature = cusEnts[0].entitlement.feature;
		const { interval, interval_count } = cusEntsToInterval({ cusEnts });

		const breakdownItem = getApiCusFeature({
			ctx,
			fullCus,
			cusEnts,
			feature,
		});

		breakdown.push(
			ApiCusFeatureBreakdownSchema.parse({
				...breakdownItem,
				reset_interval: interval,
				reset_interval_count: interval_count,
			}),
		);
	}

	return breakdown;
};

export const getApiCusFeature = ({
	ctx,
	fullCus,
	cusEnts,
	feature,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
}) => {
	const entityId = fullCus.entity?.id;

	const apiFeature = ctx.expand.includes(CusExpand.Feature)
		? toApiFeature({ feature })
		: undefined;

	// 1. If feature is boolean
	if (feature.type === FeatureType.Boolean) {
		return getBooleanApiCusFeature({
			cusEnts,
			apiFeature,
		});
	}

	const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
		cusEnts: cusEnts,
		internalFeatureId: feature.internal_id,
		includeUsageLimit: false,
	});

	// 2. If feature is unlimited
	if (unlimited) {
		return getUnlimitedApiCusFeature({ apiFeature, cusEnts });
	}

	const totalBalanceWithRollovers = sumValues(
		cusEnts
			.map((cusEnt) =>
				cusEntToBalance({
					cusEnt,
					entityId,
					withRollovers: true,
				}),
			)
			.filter(notNullish),
	);

	const totalAdjustment = sumValues(
		cusEnts.map((cusEnt) => {
			const { adjustment } = getCusEntBalance({ cusEnt, entityId });
			return adjustment;
		}),
	);

	const totalUnused = sumValues(
		cusEnts.map((cusEnt) => {
			const { unused } = getCusEntBalance({ cusEnt, entityId });
			return unused;
		}),
	);

	const nextResetAt = cusEntsToNextResetAt({ cusEnts });

	const totalMaxPurchase = sumValues(
		cusEnts.map((cusEnt) => cusEntToMaxPurchase({ cusEnt })),
	);

	const totalIncludedUsage = sumValues(
		cusEnts.map((cusEnt) => cusEntToIncludedUsage({ cusEnt, entityId })),
	);

	const totalIncludedUsageWithRollovers = sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToIncludedUsage({ cusEnt, entityId, withRollovers: true }),
		),
	);

	const totalUsage = new Decimal(totalIncludedUsageWithRollovers)
		.add(totalAdjustment)
		.sub(totalBalanceWithRollovers)
		.sub(totalUnused)
		.toNumber();

	const { interval, interval_count } = cusEntsToInterval({ cusEnts });

	const rollovers = cusEntsToRollovers({ cusEnts, entityId });

	// const apiFeature = toApiFeature({ feature });

	const { data: apiCusFeature, error } = ApiCusFeatureSchema.safeParse({
		feature: ctx.expand.includes(CusExpand.Feature) ? apiFeature : undefined,

		feature_id: feature.id,

		unlimited: false,

		starting_balance: totalIncludedUsageWithRollovers,
		balance: totalBalanceWithRollovers,

		usage: totalUsage,

		resets_at: nextResetAt,
		reset_interval: interval,
		reset_interval_count: interval_count !== 1 ? interval_count : undefined,

		// Max purchase...
		max_purchase: totalMaxPurchase > 0 ? totalMaxPurchase : undefined,
		pay_per_use: usageAllowed || undefined,

		breakdown: cusEntsToBreakdown({ ctx, fullCus, cusEnts }),
		rollovers,

		// Old stuff...
		// id: feature.id,
		// name: feature.name,
		// type: getCusFeatureType({ feature }),
		// balance: totalBalanceWithRollovers,
		// usage: totalUsage,
		// included_usage: totalIncludedUsage,
		// usage_limit:
		// 	totalUsageLimit === totalIncludedUsage ? undefined : totalUsageLimit,
		// next_reset_at: nextResetAt,
		// unlimited: false,
		// overage_allowed: usageAllowed,
		// interval,
		// interval_count,
		// rollovers,
		// credit_schema:
		// 	apiFeature.credit_schema?.map((credit) => ({
		// 		feature_id: credit.metered_feature_id,
		// 		credit_amount: credit.credit_cost,
		// 	})) || undefined,

		// breakdown: cusEntsToBreakdown({ ctx, fullCus, cusEnts }),
	});

	if (error) throw error;

	// Return in latest format - version transformation happens at Customer level
	return apiCusFeature;
};
