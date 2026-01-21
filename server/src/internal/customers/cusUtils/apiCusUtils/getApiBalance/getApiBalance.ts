import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	ApiBalanceBreakdownV1Schema,
	ApiBalanceV1Schema,
	BillingMethod,
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
	breakdown: ApiBalanceBreakdownV1;
	prepaidQuantity: number;
}[] => {
	const entityId = fullCus.entity?.id;

	const keyToCusEnts: Record<string, FullCusEntWithFullCusProduct[]> = {};
	for (const cusEnt of cusEnts) {
		const key = cusEntToKey({ cusEnt });
		keyToCusEnts[key] = [...(keyToCusEnts[key] || []), cusEnt];
	}

	const breakdown: {
		key: string;
		breakdown: ApiBalanceBreakdownV1;
		prepaidQuantity: number;
	}[] = [];

	for (const key in keyToCusEnts) {
		const cusEnts = keyToCusEnts[key];

		const feature = cusEnts[0].entitlement.feature;
		const reset = cusEntsToReset({ cusEnts, feature });
		const price = cusEntToCusPrice({ cusEnt: cusEnts[0] })?.price;

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

		// Compute included_grant: the granted amount WITHOUT prepaid
		// breakdownItem.granted = grantedBalance + totalPurchasedBalance
		// We want just the grantedBalance, so subtract purchasedBalance
		const purchasedBalance = cusEntsToPurchasedBalance({
			cusEnts,
			entityId,
		});
		const includedGrant = breakdownItem.granted - purchasedBalance;

		breakdown.push({
			key,
			breakdown: ApiBalanceBreakdownV1Schema.parse({
				id: key,

				plan_id: planId,
				included_grant: includedGrant,
				prepaid_grant: prepaidQuantity,
				remaining: breakdownItem.remaining,
				usage: breakdownItem.usage,
				unlimited: breakdownItem.unlimited,

				reset: reset,

				prepaid_quantity: prepaidQuantity,
				expires_at: expiresAt,
				price: price
					? {
							max_purchase: breakdownItem.max_purchase,
							billing_units: price.config.billing_units ?? 1,
							billing_method: cusEnts[0].usage_allowed
								? BillingMethod.UsageBased
								: BillingMethod.Prepaid,
							amount:
								"amount" in price.config ? price.config.amount : undefined,
							tiers: price.config.usage_tiers ?? undefined,
						}
					: null,
			} satisfies ApiBalanceBreakdownV1),
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
	cusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
	includeRollovers?: boolean;
	includeBreakdown?: boolean;
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
		const planId = cusEntsToPlanId({ cusEnts });
		return {
			data: getBooleanApiBalance({
				cusEnts,
				apiFeature,
			}),
			legacyData: {
				key: null,
				prepaid_quantity: 0,
				purchased_balance: 0,
				plan_id: planId,
				breakdown_legacy_data: [],
			},
		};
	}

	const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
		cusEnts: cusEnts,
		internalFeatureId: feature.internal_id,
		includeUsageLimit: false,
	});

	// 2. If feature is unlimited
	if (unlimited) {
		const planId = cusEntsToPlanId({ cusEnts });
		return {
			data: getUnlimitedApiBalance({ apiFeature, cusEnts }),
			legacyData: {
				key: null,
				prepaid_quantity: 0,
				purchased_balance: 0,
				plan_id: planId,
				breakdown_legacy_data: [],
			},
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

	const { data: apiBalance, error } = ApiBalanceV1Schema.safeParse({
		feature: expandIncludes({
			expand: ctx.expand,
			includes: [CheckExpand.BalanceFeature, CusExpand.BalancesFeature],
		})
			? apiFeature
			: undefined,

		feature_id: feature.id,

		unlimited: false,

		// Granted balance = granted balance + additional granted balance
		granted: grantedBalance + totalPurchasedBalance,

		// Purchased balance = negative balance
		// purchased_balance: totalPurchasedBalance,

		// Current balance = balance + additional balance
		remaining: currentBalance,

		// Usage = granted balance + purchased balance - current balance
		usage: totalUsage,

		// Max purchase...
		overage_allowed: usageAllowed ?? false,

		max_purchase: totalMaxPurchase,
		reset: reset,

		// plan_id: planId,
		breakdown: breakdown.map((item) => item.breakdown),
		rollovers,
	} satisfies ApiBalanceV1);

	if (error) throw error;

	// Return in latest format - version transformation happens at Customer level
	const totalPrepaidQuantity = cusEntsToPrepaidQuantity({
		cusEnts,
		sumAcrossEntities: nullish(entityId),
	});
	const breakdownLegacyData = breakdown.map((item) => ({
		key: item.key,
		prepaid_quantity: item.prepaidQuantity,
	}));

	return {
		data: apiBalance,
		legacyData: {
			key: masterKey,
			prepaid_quantity: totalPrepaidQuantity,
			purchased_balance: totalPurchasedBalance,
			plan_id: planId,
			breakdown_legacy_data: breakdownLegacyData,
		},
	};
};
