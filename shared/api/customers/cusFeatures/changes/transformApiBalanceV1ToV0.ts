import type {
	ApiBalance,
	ApiBalanceBreakdown,
} from "@api/customers/cusFeatures/apiBalance.js";
import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
} from "@api/customers/cusFeatures/apiBalanceV1.js";
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
		prepaid_quantity: input.prepaid_quantity,
		expires_at: input.expires_at,
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
	const purchasedBalance = legacyData?.purchased_balance ?? 0;

	// V0 granted_balance = V1 granted - purchased_balance
	const grantedBalance = input.granted - purchasedBalance;

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
		reset: input.reset,
		plan_id: legacyData?.plan_id ?? null,
		breakdown: input.breakdown?.map((b) =>
			transformApiBalanceBreakdownV1ToV0({ input: b }),
		),
		rollovers: input.rollovers,
	};
}
