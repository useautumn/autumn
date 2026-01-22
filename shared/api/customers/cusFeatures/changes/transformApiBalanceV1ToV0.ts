import type {
	ApiBalance,
	ApiBalanceBreakdown,
} from "@api/customers/cusFeatures/apiBalance.js";
import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
} from "@api/customers/cusFeatures/apiBalanceV1.js";
import {
	apiBalanceBreakdownV1ToPurchasedBalance,
	apiBalanceV1ToPurchasedBalance,
} from "@utils/cusEntUtils/apiBalance/apiBalanceV1ToPurchasedBalance.js";
import { deduplicateArray } from "@utils/utils.js";
import type { CusFeatureLegacyData } from "../cusFeatureLegacyData.js";

export function transformApiBalanceBreakdownV1ToV0({
	input,
}: {
	input: ApiBalanceBreakdownV1;
}): ApiBalanceBreakdown {
	// For usage-based billing, purchased_balance includes prepaid + overage
	// Overage = usage beyond what was granted and prepaid
	// const totalGrantedAndPrepaid = input.included_grant + input.prepaid_grant;
	// const overage = Math.max(0, input.usage - totalGrantedAndPrepaid);
	// const purchasedBalance = input.prepaid_grant + overage;

	// 1. Granted balance: just included_grant
	// 2. Purchased balance:
	const purchasedBalance = apiBalanceBreakdownV1ToPurchasedBalance({
		apiBalanceBreakdown: input,
	});

	return {
		id: input.id,
		plan_id: input.plan_id,
		granted_balance: input.included_grant,
		purchased_balance: purchasedBalance,
		current_balance: input.remaining,
		usage: input.usage,
		overage_allowed: input.price?.billing_method === "usage_based",
		max_purchase: input.price?.max_purchase ?? null,
		reset: input.reset,
		expires_at: input.expires_at,
		prepaid_quantity: input.prepaid_grant,
	};
}

/**
 * Transform ApiBalanceV1 (V2.1 format) to ApiBalance (V2.0 format)
 *
 * In V1 format:
 * - `granted` = granted_balance + purchased_balance (combined)
 * - `remaining` = current_balance
 *
 * In V0 format:
 * - `granted_balance` = granted amount (excluding purchased)
 * - `purchased_balance` = purchased/prepaid amount
 * - `current_balance` = remaining balance
 *
 * To convert back, we need legacyData.purchased_balance to split them.
 */
export function transformApiBalanceV1ToV0({
	input,
	legacyData,
}: {
	input: ApiBalanceV1;
	legacyData?: CusFeatureLegacyData;
}): ApiBalance {
	// Get purchased_balance from legacyData (needed to split V1.granted back to V0 fields)
	const purchasedBalance = apiBalanceV1ToPurchasedBalance({
		apiBalance: input,
	});

	const grantedBalance = input.granted;

	// Define next_reset_at from input.breakdown.reset. See how I did it previously
	const breakdownPlanIds = deduplicateArray(
		input.breakdown?.map((b) => b.plan_id) ?? [],
	);

	// Check if there are multiple intervals
	const uniqueIntervals = deduplicateArray(
		input.breakdown?.map((b) => b.reset?.interval) ?? [],
	);

	const reset =
		uniqueIntervals.length > 1
			? {
					interval: "multiple" as const,
					interval_count: undefined,
					resets_at: null,
				}
			: (input.breakdown?.[0]?.reset ?? null);

	return {
		feature_id: input.feature_id,
		feature: input.feature,
		unlimited: input.unlimited,
		granted_balance: grantedBalance,
		purchased_balance: purchasedBalance,
		current_balance: input.remaining,
		usage: input.usage,
		overage_allowed: input.overage_allowed,
		max_purchase: input.max_purchase,
		reset: reset,
		plan_id: breakdownPlanIds.length > 1 ? null : (breakdownPlanIds[0] ?? null),
		breakdown: input.breakdown?.map((b) =>
			transformApiBalanceBreakdownV1ToV0({ input: b }),
		),
		rollovers: input.rollovers,
	};
}
