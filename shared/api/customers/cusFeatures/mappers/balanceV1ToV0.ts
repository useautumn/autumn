import { deduplicateArray } from "@utils/utils";
import { Decimal } from "decimal.js";
import type { ApiBalance, ApiBalanceBreakdown } from "../apiBalance";
import type { ApiBalanceBreakdownV1, ApiBalanceV1 } from "../apiBalanceV1";
import { apiBalanceV1ToPrepaidQuantity } from "../utils/convert/apiBalanceV1ToPrepaidQuantity";
import { apiBalanceV1ToPurchasedBalance } from "../utils/convert/apiBalanceV1ToPurchasedBalance";

export function balanceBreakdownV1ToV0({
	input,
}: {
	input: ApiBalanceBreakdownV1;
}): ApiBalanceBreakdown {
	const overage = input.overage ?? 0;
	const purchasedBalance = new Decimal(input.prepaid_grant)
		.add(overage)
		.toNumber();

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

export function balanceV1ToV0({ input }: { input: ApiBalanceV1 }): ApiBalance {
	const purchasedBalance = apiBalanceV1ToPurchasedBalance({
		apiBalance: input,
	});

	const prepaidQuantity = apiBalanceV1ToPrepaidQuantity({ apiBalance: input });

	const grantedBalance = new Decimal(input.granted)
		.sub(prepaidQuantity)
		.toNumber();

	const breakdownPlanIds = deduplicateArray(
		input.breakdown?.map((b) => b.plan_id) ?? [],
	);

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
			balanceBreakdownV1ToV0({ input: b }),
		),
		rollovers: input.rollovers,
	};
}
