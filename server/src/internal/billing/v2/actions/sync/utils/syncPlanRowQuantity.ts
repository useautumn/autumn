import type { SyncProductContext } from "@autumn/shared";

/** An add-on's Stripe quantity becomes N rows; a main plan's becomes one row × N. */
export const syncPlanRowQuantity = ({
	productContext,
}: {
	productContext: SyncProductContext;
}): number =>
	productContext.fullProduct.is_add_on === true
		? 1
		: (productContext.plan.quantity ?? 1);
