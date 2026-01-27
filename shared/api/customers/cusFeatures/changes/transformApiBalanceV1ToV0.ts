import type {
	ApiBalance,
	ApiBalanceBreakdown,
} from "@api/customers/cusFeatures/apiBalance.js";
import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
} from "@api/customers/cusFeatures/apiBalanceV1.js";
import { apiBalanceV1ToPrepaidQuantity } from "@utils/cusEntUtils/apiBalance/apiBalanceV1ToPrepaidQuantity.js";
import { apiBalanceV1ToPurchasedBalance } from "@utils/index.js";
import { deduplicateArray } from "@utils/utils.js";
import { Decimal } from "decimal.js";
import type { CusFeatureLegacyData } from "../cusFeatureLegacyData.js";

export function transformApiBalanceBreakdownV1ToV0({
	input,
}: {
	input: ApiBalanceBreakdownV1;
}): ApiBalanceBreakdown {
	// For usage-based billing, purchased_balance includes prepaid + overage
	// Overage = usage beyond what was granted and prepaid
	const totalGrantedAndPrepaid = input.included_grant + input.prepaid_grant;
	const overage = Math.max(0, input.usage - totalGrantedAndPrepaid);
	const purchasedBalance = input.prepaid_grant + overage;

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
		prepaid_quantity: input.prepaid_grant,
		expires_at: input.expires_at,
	};
}

/**
 * Transform ApiBalanceV1 (V2.1 format) to ApiBalance (V2.0 format)
 *
 * In V1 format:
 * - `granted` = total granted amount
 * - `remaining` = current balance
 * - `next_reset_at` = when balance resets
 *
 * In V0 format:
 * - `granted_balance` = granted amount
 * - `purchased_balance` = purchased/prepaid amount (calculated from breakdown)
 * - `current_balance` = remaining balance
 * - `reset` = reset interval object
 */
export function transformApiBalanceV1ToV0({
	input,
	legacyData,
}: {
	input: ApiBalanceV1;
	legacyData?: CusFeatureLegacyData;
}): ApiBalance {
	// Calculate purchased_balance from breakdown
	const purchasedBalance = apiBalanceV1ToPurchasedBalance({
		apiBalance: input,
	});
	const prepaidQuantity = apiBalanceV1ToPrepaidQuantity({ apiBalance: input });

	// V0 granted_balance = V1 granted - purchased_balance
	// V1 granted includes both included + prepaid, but V0 splits them
	const grantedBalance = new Decimal(input.granted)
		.sub(prepaidQuantity)
		.toNumber();

	// Get plan_id from breakdown
	const breakdownPlanIds = deduplicateArray(
		input.breakdown?.map((b) => b.plan_id) ?? [],
	);

	// Build reset object from breakdown
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
			: input.breakdown?.[0]?.reset
				? {
						...input.breakdown[0].reset,
						resets_at: input.next_reset_at,
					}
				: null;

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
