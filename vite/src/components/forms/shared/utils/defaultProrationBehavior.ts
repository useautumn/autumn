import type { BillingBehavior } from "@autumn/shared";

/** The proration a billing sheet opens on: none ("No charges") where the flow allows it, else prorated. */
export const defaultProrationBehavior = ({
	noChargesAllowed,
}: {
	noChargesAllowed: boolean;
}): BillingBehavior => (noChargesAllowed ? "none" : "prorate_immediately");
