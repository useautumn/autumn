import {
	type AutumnBillingPlan,
	cp,
	type FullCusProduct,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyUncancelToPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/cancel/applyUncancelToPlan";
import { applyCancelPlan } from "./applyCancelPlan";
import { computeCancelLineItems } from "./computeCancelLineItems";
import { computeCancelUpdates } from "./computeCancelUpdates";
import { computeCustomerProductToDelete } from "./computeCustomerProductToDelete";
import { computeDefaultCustomerProduct } from "./computeDefaultCustomerProduct";
import { computeEndOfCycleMs } from "./computeEndOfCycleMs";

const computeScheduledAddOnsToDelete = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}): FullCusProduct[] => {
	// Immediate main-plan cancellation invalidates future add-on phases in the same scope.
	const { cancelAction, customerProduct, fullCustomer } = billingContext;
	if (cancelAction !== "cancel_immediately") return [];
	if (!cp(customerProduct).main().recurring().valid) return [];

	const internalEntityId =
		customerProduct.internal_entity_id ??
		fullCustomer.entity?.internal_id ??
		undefined;

	return fullCustomer.customer_products.filter((candidateProduct) => {
		if (candidateProduct.id === customerProduct.id) return false;

		return cp(candidateProduct)
			.addOn()
			.scheduled()
			.recurring()
			.onEntity({ internalEntityId }).valid;
	});
};

/**
 * Computes and applies the cancel plan for a subscription.
 *
 * Handles two cancel actions:
 * - 'cancel_end_of_cycle': Schedule cancellation at cycle end, insert scheduled default product
 * - 'cancel_immediately': Cancel now, insert active default product
 */
export const computeCancelPlan = ({
	ctx,
	billingContext,
	plan,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	plan: AutumnBillingPlan;
}): AutumnBillingPlan => {
	if (!billingContext.cancelAction) return plan;

	if (billingContext.cancelAction === "uncancel") {
		return applyUncancelToPlan({
			billingContext,
			plan,
		});
	}

	// Step 1: Calculate when the subscription ends
	const endOfCycleMs = computeEndOfCycleMs({ billingContext });

	ctx.logger.debug(
		`[computeCancelPlan] ${billingContext.cancelAction}: end of cycle at ${endOfCycleMs}`,
	);

	// Step 2: Build cancel updates for customer product
	const cancelUpdates = computeCancelUpdates({ billingContext, endOfCycleMs });

	// Step 3: Create default product (if applicable)
	const defaultCustomerProduct = computeDefaultCustomerProduct({
		ctx,
		billingContext,
		endOfCycleMs,
	});

	ctx.logger.debug(
		`[computeCancelPlan] default customer product: ${defaultCustomerProduct?.product.name}`,
	);

	// Step 4: Find existing scheduled product to delete
	const productToDelete = computeCustomerProductToDelete({ billingContext });
	const productsToDelete = computeScheduledAddOnsToDelete({ billingContext });

	// Step 5: Compute prorated refund line items for immediate cancellation
	const cancelLineItems = computeCancelLineItems({ ctx, billingContext });

	// Apply all computed values to the plan
	return applyCancelPlan({
		plan,
		cancelUpdates,
		defaultCustomerProduct,
		productToDelete,
		productsToDelete,
		cancelLineItems,
		existingCustomerProduct: billingContext.customerProduct,
	});
};
