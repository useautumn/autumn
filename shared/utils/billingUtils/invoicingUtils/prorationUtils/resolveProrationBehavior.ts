import type { BillingBehavior } from "@api/billing/common/billingBehavior";

/** An unset proration_behavior prorates, in every billing action that takes one. */
export const resolveProrationBehavior = ({
	prorationBehavior,
}: {
	prorationBehavior?: BillingBehavior | null;
}): BillingBehavior => prorationBehavior ?? "prorate_immediately";
