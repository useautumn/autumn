import type {
	ApiBalance,
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	type ApiBalanceBreakdown,
	ApiBalanceBreakdownSchema,
	ApiBalanceSchema,
	CheckExpand,
	CusExpand,
	cusEntMatchesFeature,
	cusEntsToAdjustment,
	cusEntsToAllowance,
	cusEntsToBalance,
	cusEntsToMaxPurchase,
	cusEntToCusPrice,
	cusEntToKey,
	cusEntToPurchasedBalance,
	dbToApiFeatureV1,
	expandIncludes,
	type Feature,
	FeatureType,
	getCusEntBalance,
	isPrepaidPrice,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getUnlimitedAndUsageAllowed } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import type { CusFeatureLegacyData } from "../../../../../../../shared/api/customers/cusFeatures/cusFeatureLegacyData.js";
import {
	cusEntsToReset,
	cusEntsToRollovers,
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
}):
	| {
			key: string;
			breakdown: ApiBalanceBreakdown;
			prepaidQuantity: number;
	  }[]
	| undefined => {
	const keyToCusEnts: Record<string, FullCusEntWithFullCusProduct[]> = {};
	for (const cusEnt of cusEnts) {
		const key = cusEntToKey({ cusEnt });
		keyToCusEnts[key] = [...(keyToCusEnts[key] || []), cusEnt];
	}

	const cusEntCount = Object.keys(keyToCusEnts).length;
	if (cusEntCount <= 1) return undefined;

	const breakdown: {
		key: string;
		breakdown: ApiBalanceBreakdown;
		prepaidQuantity: number;
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
		});

		const prepaidQuantity = cusEntsToPrepaidQuantity({ cusEnts, feature });
		const planId = cusEnts[0].customer_product.product.id;

		breakdown.push({
			key,
			breakdown: ApiBalanceBreakdownSchema.parse({
				plan_id: planId,
				granted_balance: breakdownItem.granted_balance,
				purchased_balance: breakdownItem.purchased_balance,
				current_balance: breakdownItem.current_balance,
				usage: breakdownItem.usage,

				max_purchase: breakdownItem.max_purchase,
				overage_allowed: breakdownItem.overage_allowed,

				reset: reset,
			}),
			prepaidQuantity: prepaidQuantity,
		});
	}

	return breakdown;
};

export const cusEntsToPrepaidQuantity = ({
	cusEnts,
	feature,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
}) => {
	let prepaidQuantity = new Decimal(0);

	for (const cusEnt of cusEnts) {
		// 1. if cus ent doesn't match feature, skip
		if (!cusEntMatchesFeature({ cusEnt, feature })) continue;

		// 2. If cus ent is not prepaid, skip
		const cusPrice = cusEntToCusPrice({ cusEnt });

		if (!cusPrice || !isPrepaidPrice({ price: cusPrice.price })) continue;

		// 3. Get quantity
		const options = cusEnt.customer_product.options.find(
			(option) => option.internal_feature_id === feature.internal_id,
		);

		if (!options) continue;

		const quantityWithUnits = new Decimal(options.quantity)
			.mul(cusPrice.price.config.billing_units ?? 1)
			.toNumber();

		prepaidQuantity = prepaidQuantity.add(quantityWithUnits);
	}

	return prepaidQuantity.toNumber();
};

export const getApiBalance = ({
	ctx,
	fullCus,
	cusEnts,
	feature,
	includeRollovers = true,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
	includeRollovers?: boolean;
}): { data: ApiBalance; legacyData?: CusFeatureLegacyData } => {
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

	const totalAdditionalBalance = sumValues(
		cusEnts.map((cusEnt) => {
			const { additional_balance } = getCusEntBalance({ cusEnt, entityId });
			return additional_balance;
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
	const totalPurchasedBalance = sumValues(
		cusEnts.map((cusEnt) => cusEntToPurchasedBalance({ cusEnt, entityId })),
	);

	// 3. Current balance
	const totalBalanceWithRollovers = cusEntsToBalance({
		cusEnts,
		entityId,
		withRollovers: includeRollovers,
	});

	const currentBalance = new Decimal(Math.max(0, totalBalanceWithRollovers))
		.add(totalAdditionalBalance)
		.add(totalUnused)
		.toNumber();

	// 4. Usage
	const totalUsage = new Decimal(grantedBalance)
		.add(totalPurchasedBalance)
		.sub(currentBalance)
		.toNumber();

	const reset = cusEntsToReset({ cusEnts, feature });
	const rollovers = cusEntsToRollovers({ cusEnts, entityId });

	const breakdownSet = cusEntsToBreakdown({ ctx, fullCus, cusEnts });
	const masterKey = breakdownSet ? null : cusEntToKey({ cusEnt: cusEnts[0] });

	const { data: apiBalance, error } = ApiBalanceSchema.safeParse({
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

		plan_id: breakdownSet ? null : cusEnts[0].customer_product.product.id,
		breakdown: breakdownSet?.map((item) => item.breakdown),
		rollovers,
	} satisfies ApiBalance);

	if (error) throw error;

	// Return in latest format - version transformation happens at Customer level
	const totalPrepaidQuantity = cusEntsToPrepaidQuantity({ cusEnts, feature });
	const breakdownLegacyData = breakdownSet?.map((item) => ({
		key: item.key,
		prepaid_quantity: item.prepaidQuantity,
	}));

	return {
		data: apiBalance,
		legacyData: {
			key: masterKey,
			prepaid_quantity: totalPrepaidQuantity,
			breakdown_legacy_data: breakdownLegacyData ?? [],
		},
	};
};
