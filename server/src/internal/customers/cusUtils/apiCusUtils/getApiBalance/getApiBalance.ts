import type {
	ApiBalanceV0,
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	type ApiBalanceBreakdownV0,
	ApiBalanceBreakdownV0Schema,
	ApiBalanceV0Schema,
	CheckExpand,
	CusExpand,
	cusEntsToAdjustment,
	cusEntsToAllowance,
	cusEntsToCurrentBalance,
	cusEntsToMaxPurchase,
	cusEntsToPlanId,
	cusEntsToPrepaidQuantity,
	cusEntsToPurchasedBalance,
	cusEntsToReset,
	cusEntsToRollovers,
	cusEntToCusPrice,
	cusEntToKey,
	dbToApiFeatureV1,
	expandIncludes,
	type Feature,
	FeatureType,
	getCusEntBalance,
	nullish,
	sumValues,
	UsageModel,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getUnlimitedAndUsageAllowed } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import type { CusFeatureLegacyData } from "../../../../../../../shared/api/customers/cusFeatures/cusFeatureLegacyData.js";
import {
	getBooleanApiBalance,
	getUnlimitedApiBalance,
} from "./apiBalanceUtils.js";

const cusEntsToBreakdown = ({
	ctx,
	fullCus,
	cusEnts,
}: {
	ctx: RequestContext;
	cusEnts: FullCusEntWithFullCusProduct[];
	fullCus: FullCustomer;
}): {
	key: string;
	breakdown: ApiBalanceBreakdownV0;
	prepaidQuantity: number;
	price: any | null;
}[] => {
	const entityId = fullCus.entity?.id;

	const keyToCusEnts: Record<string, FullCusEntWithFullCusProduct[]> = {};
	for (const cusEnt of cusEnts) {
		const key = cusEntToKey({ cusEnt });
		keyToCusEnts[key] = [...(keyToCusEnts[key] || []), cusEnt];
	}

	const breakdown: {
		key: string;
		breakdown: ApiBalanceBreakdownV0;
		prepaidQuantity: number;
		price: any | null;
	}[] = [];

	for (const key in keyToCusEnts) {
		const cusEnts = keyToCusEnts[key];

		const feature = cusEnts[0].entitlement.feature;
		const reset = cusEntsToReset({ cusEnts, feature });

		const { data: breakdownItem } = getApiBalance({
			ctx,
			fullCus,
			cusEnts,
			feature,
			includeRollovers: false,
			includeBreakdown: false,
		});

		const prepaidQuantity = cusEntsToPrepaidQuantity({
			cusEnts,
			sumAcrossEntities: nullish(entityId),
		});

		const planId = cusEntsToPlanId({ cusEnts });

		// Get expires_at from the first cusEnt (since key is cusEnt.id, there's only one)
		const expiresAt = cusEnts[0]?.expires_at ?? null;

		// Build price object from entitlement's price config (needed for V2.1)
		const cusPrice = cusEntToCusPrice({ cusEnt: cusEnts[0] });
		const priceConfig = cusPrice?.price.config;

		// Determine usage_model based on overage_allowed
		const usageAllowed = breakdownItem.overage_allowed;
		const usageModel = usageAllowed ? UsageModel.PayPerUse : UsageModel.Prepaid;

		const price = priceConfig
			? {
					amount: priceConfig.usage_tiers?.[0]?.amount,
					tiers: priceConfig.usage_tiers,
					billing_units: priceConfig.billing_units ?? 1,
					usage_model: usageModel,
					max_purchase: breakdownItem.max_purchase,
				}
			: null;

		breakdown.push({
			key,
			breakdown: ApiBalanceBreakdownV0Schema.parse({
				id: key,

				plan_id: planId,
				granted_balance: breakdownItem.granted_balance,
				purchased_balance: breakdownItem.purchased_balance,
				current_balance: breakdownItem.current_balance,
				usage: breakdownItem.usage,

				max_purchase: breakdownItem.max_purchase,
				overage_allowed: breakdownItem.overage_allowed,

				reset: reset,

				prepaid_quantity: prepaidQuantity,
				expires_at: expiresAt,
			}),
			prepaidQuantity: prepaidQuantity,
			price: price,
		});
	}

	return breakdown;
};

export const getApiBalance = ({
	ctx,
	fullCus,
	cusEnts,
	feature,
	includeRollovers = true,
	includeBreakdown = true,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
	includeRollovers?: boolean;
	includeBreakdown?: boolean;
}): { data: ApiBalanceV0; legacyData?: CusFeatureLegacyData } => {
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

	const totalMaxPurchase = cusEntsToMaxPurchase({ cusEnts, entityId });

	const totalAllowanceWithRollovers = cusEntsToAllowance({
		cusEnts,
		entityId,
		withRollovers: includeRollovers,
	});

	const totalAdjustment = cusEntsToAdjustment({
		cusEnts,
		entityId,
	});

	const grantedBalance = new Decimal(totalAllowanceWithRollovers)
		.add(totalAdjustment)
		.toNumber();

	// 2. Purchased balance
	const totalPurchasedBalance = cusEntsToPurchasedBalance({
		cusEnts,
		entityId,
	});

	// 3. Current balance
	let currentBalance = cusEntsToCurrentBalance({
		cusEnts,
		entityId,
		withRollovers: includeRollovers,
	});

	currentBalance = new Decimal(currentBalance).add(totalUnused).toNumber();

	// 4. Usage
	const totalUsage = new Decimal(grantedBalance)
		.add(totalPurchasedBalance)
		.sub(currentBalance)
		.toNumber();

	const reset = cusEntsToReset({ cusEnts, feature });
	const rollovers = cusEntsToRollovers({ cusEnts, entityId });

	const breakdown = includeBreakdown
		? cusEntsToBreakdown({ ctx, fullCus, cusEnts })
		: [];

	const planId = cusEntsToPlanId({ cusEnts });

	const masterKey = breakdown ? null : cusEntToKey({ cusEnt: cusEnts[0] });

	const { data: apiBalance, error } = ApiBalanceV0Schema.safeParse({
		feature: expandIncludes({
			expand: ctx.expand,
			includes: [CheckExpand.BalanceFeature, CusExpand.BalancesFeature],
		})
			? apiFeature
			: undefined,

		feature_id: feature.id,

		unlimited: false,

		// Granted balance = granted balance + additional granted balance
		granted_balance: grantedBalance,

		// Purchased balance = negative balance
		purchased_balance: totalPurchasedBalance,

		// Current balance = balance + additional balance
		current_balance: currentBalance,

		// Usage = granted balance + purchased balance - current balance
		usage: totalUsage,

		// Max purchase...
		overage_allowed: usageAllowed ?? false,

		max_purchase: totalMaxPurchase,
		reset: reset,

		plan_id: planId,
		breakdown: breakdown.map((item) => item.breakdown),
		rollovers,
	} satisfies ApiBalanceV0);

	if (error) throw error;

	// Return in latest format - version transformation happens at Customer level
	const totalPrepaidQuantity = cusEntsToPrepaidQuantity({
		cusEnts,
		sumAcrossEntities: nullish(entityId),
	});
	
	// Store price info for V0 → V1 transform (breakdown legacy data)
	const breakdownLegacyData = breakdown.map((item) => ({
		// For V2.0 → V1.2 transform
		key: item.key,
		prepaid_quantity: item.prepaidQuantity,
		// For V2.1 → V2.0 transform (stored in breakdown)
		id: item.key,
		overage_allowed: item.breakdown.overage_allowed ?? false,
		max_purchase: item.breakdown.max_purchase ?? null,
		// For V0 → V1 transform (need price in V1)
		price: item.price,
	}));

	return {
		data: apiBalance,
		legacyData: {
			// For V2.0 → V1.2 transform
			key: masterKey,
			prepaid_quantity: totalPrepaidQuantity,
			// For V2.1 → V2.0 transform
			purchased_balance: totalPurchasedBalance,
			plan_id: planId,
			// Combined breakdown legacy data
			breakdown_legacy_data: breakdownLegacyData,
		},
	};
};
