import type { BillingBehavior } from "@autumn/shared";

export const defaultProrationBehavior = ({
	noChargesAllowed,
}: {
	noChargesAllowed: boolean;
}): BillingBehavior => (noChargesAllowed ? "none" : "prorate_immediately");
