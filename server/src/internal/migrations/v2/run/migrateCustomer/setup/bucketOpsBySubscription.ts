import type { CustomerOperations, FullCusProduct } from "@autumn/shared";
import { matchCustomerProductsByTarget } from "@/internal/migrations/v2/run/perItem/matchPlanFilter.js";
import type { OperationMatch, SubscriptionBucket } from "./types.js";

/**
 * Resolve every op's `target` against the customer's cusproducts and
 * group the resulting (op, cusProduct) matches by the cusproduct's
 * Stripe subscription id (first entry of `subscription_ids`, or `null`).
 *
 * Buckets are returned with non-null subs first, then the null bucket
 * last — purely cosmetic for predictable execution order.
 */
export const bucketOpsBySubscription = ({
	cusProducts,
	operations,
}: {
	cusProducts: FullCusProduct[];
	operations: CustomerOperations;
}): SubscriptionBucket[] => {
	const groups = new Map<string | null, OperationMatch[]>();

	for (const op of operations.update_plans ?? []) {
		const matched = matchCustomerProductsByTarget({
			cusProducts,
			target: op.target,
		});
		for (const cusProduct of matched) {
			const subId = cusProduct.subscription_ids?.[0] ?? null;
			const list = groups.get(subId) ?? [];
			list.push({ op, cusProduct });
			groups.set(subId, list);
		}
	}

	const buckets: SubscriptionBucket[] = [];
	for (const [subId, matches] of groups) {
		if (subId !== null)
			buckets.push({ stripe_subscription_id: subId, matches });
	}
	const nullMatches = groups.get(null);
	if (nullMatches?.length)
		buckets.push({ stripe_subscription_id: null, matches: nullMatches });

	return buckets;
};
