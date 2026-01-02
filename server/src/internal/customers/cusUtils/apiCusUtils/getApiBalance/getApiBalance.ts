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
	cusEntsToAdjustment,
	cusEntsToAllowance,
	cusEntsToCurrentBalance,
	cusEntsToMaxPurchase,
	cusEntsToPlanId,
	cusEntsToPrepaidQuantity,
	cusEntsToReset,
	cusEntsToRollovers,
	cusEntToKey,
	cusEntToPurchasedBalance,
	dbToApiFeatureV1,
	expandIncludes,
	type Feature,
	FeatureType,
	getCusEntBalance,
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

const cusEntsToBreakdown = ({
	ctx,
	fullCus,
	cusEnts,
}: {
	ctx: RequestContext;
	cusEnts: (FullCusEntWithFullCusProduct)[];
	fullCus: FullCustomer;
}): {
	key: string;
	breakdown: ApiBalanceBreakdown;
	prepaidQuantity: number;
}[] => {
	const keyToCusEnts: Record<string, FullCusEntWithFullCusProduct[]> = {};
	for (const cusEnt of cusEnts) {
		const key = cusEntToKey({ cusEnt });
		keyToCusEnts[key] = [...(keyToCusEnts[key] || []), cusEnt];
	}

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
			includeBreakdown: false,
		});

		const prepaidQuantity = cusEntsToPrepaidQuantity({ cusEnts });
		const planId = cusEntsToPlanId({ cusEnts });

		breakdown.push({
			key,
			breakdown: ApiBalanceBreakdownSchema.parse({
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
			}),
			prepaidQuantity: prepaidQuantity,
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
	cusEnts: (FullCusEntWithFullCusProduct)[];
	feature: Feature;
	includeRollovers?: boolean;
	includeBreakdown?: boolean;
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

	const breakdownSet = includeBreakdown
		? cusEntsToBreakdown({ ctx, fullCus, cusEnts })
		: undefined;

	const planId = cusEntsToPlanId({ cusEnts });

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

		plan_id: planId,
		breakdown: breakdownSet?.map((item) => item.breakdown),
		rollovers,
	} satisfies ApiBalance);

	if (error) throw error;

	// Return in latest format - version transformation happens at Customer level
	const totalPrepaidQuantity = cusEntsToPrepaidQuantity({ cusEnts });
	const breakdownLegacyData = breakdownSet?.map((item) => ({
		key: item.key,
		prepaid_quantity: item.prepaidQuantity,
	}));

	return {
		data: apiBalance,
		legacyData: {
			key: masterKey,
			prepaid_quantity: totalPrepaidQuantity,
			breakdown_legacy_data: breakdownLegacyData,
		},
	};
};
