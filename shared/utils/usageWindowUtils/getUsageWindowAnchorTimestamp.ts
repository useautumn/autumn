import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";

/**
 * The timestamp a usage window's bounds align to: the anchor entitlement's
 * own reset cycle, falling back to the product's billing-cycle anchor, else
 * null (UTC calendar). Windows therefore roll WITH the entitlement's cycle --
 * and a plan change that restarts the cycle restarts the window.
 */
export const getUsageWindowAnchorTimestamp = ({
	anchorCustomerEntitlement,
}: {
	anchorCustomerEntitlement?: FullCusEntWithFullCusProduct;
}): number | null =>
	anchorCustomerEntitlement?.next_reset_at ??
	anchorCustomerEntitlement?.customer_product?.billing_cycle_anchor_resets_at ??
	null;
