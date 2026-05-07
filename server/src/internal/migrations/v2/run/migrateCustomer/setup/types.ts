import type { FullCusProduct, UpdatePlanOp } from "@autumn/shared";

/**
 * One (op, cusProduct) pair after target matching. Each match becomes
 * a unit of work for the per-op processors.
 */
export type OperationMatch = {
	op: UpdatePlanOp;
	cusProduct: FullCusProduct;
};

/**
 * A group of operation-matches that share one Stripe subscription (or
 * the null bucket — entitlement-only / no Stripe sub). Each bucket
 * runs its own setup → process → evaluate → execute pipeline so the
 * familiar one-sub-per-action billing v2 model holds.
 */
export type SubscriptionBucket = {
	stripe_subscription_id: string | null;
	matches: OperationMatch[];
};
