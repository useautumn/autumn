import {
	cusProductToLineItems,
	type FullCusProduct,
	type LineItem,
	secondsToMs,
} from "@autumn/shared";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { logBuildAutumnLineItems } from "./logBuildAutumnLineItems";

export const buildAutumnLineItems = ({
	ctx,
	newCustomerProducts,
	deletedCustomerProduct,
	billingContext,
}: {
	ctx: AutumnContext;
	newCustomerProducts: FullCusProduct[];
	deletedCustomerProduct?: FullCusProduct;
	billingContext: BillingContext;
}) => {
	// billingCycleAnchor = billingCycleAnchor ?? now;
	const { billingCycleAnchorMs, currentEpochMs, stripeSubscription } =
		billingContext;

	const { org, logger } = ctx;

	// For now, update subscription doesn't charge for existing usage.
	const arrearLineItems: LineItem[] = [];
	// cusProductToArrearLineItems({
	// 	cusProduct: deletedCustomerProduct,
	// 	billingCycleAnchorMs,
	// 	nowMs: currentEpochMs,
	// 	org,
	// })

	// Get line items for ongoing cus product
	const originalBillingCycleAnchorMs = stripeSubscription?.billing_cycle_anchor
		? secondsToMs(stripeSubscription.billing_cycle_anchor)
		: "now";
	const deletedLineItems = deletedCustomerProduct
		? cusProductToLineItems({
				cusProduct: deletedCustomerProduct,
				nowMs: currentEpochMs,
				billingCycleAnchorMs: originalBillingCycleAnchorMs,
				direction: "refund",
				org,
				logger,
			})
		: [];

	const newLineItems = newCustomerProducts.flatMap((newCustomerProduct) =>
		cusProductToLineItems({
			cusProduct: newCustomerProduct,
			nowMs: currentEpochMs,
			billingCycleAnchorMs,
			direction: "charge",
			org,
			logger,
		}),
	);

	// Combine all line items - trial filtering and unchanged price filtering
	// will be handled in finalizeUpdateSubscriptionPlan
	const allLineItems = [...deletedLineItems, ...newLineItems];

	logBuildAutumnLineItems({
		logger,
		deletedLineItems,
		newLineItems,
	});

	return allLineItems;
};
