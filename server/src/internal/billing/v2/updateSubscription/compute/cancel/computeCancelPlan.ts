import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";
import { applyCancelPlan } from "./applyCancelPlan";
import { computeCancelLineItems } from "./computeCancelLineItems";
import { computeCancelUpdates } from "./computeCancelUpdates";
import { computeCustomerProductToDelete } from "./computeCustomerProductToDelete";
import { computeDefaultCustomerProduct } from "./computeDefaultCustomerProduct";
import { computeEndOfCycleMs } from "./computeEndOfCycleMs";

/**
 * Computes and applies the cancel plan for a subscription.
 *
 * Handles two modes:
 * - 'end_of_cycle': Schedule cancellation at cycle end, insert scheduled default product
 * - 'immediately': Cancel now, insert active default product
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
	if (!billingContext.cancelMode) return plan;

	// Step 1: Calculate when the subscription ends
	const endOfCycleMs = computeEndOfCycleMs({ billingContext });

	ctx.logger.debug(
		`[computeCancelPlan] ${billingContext.cancelMode}: end of cycle at ${endOfCycleMs}`,
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

	// Step 5: Compute prorated refund line items for immediate cancellation
	const cancelLineItems = computeCancelLineItems({ ctx, billingContext });

	// Apply all computed values to the plan
	return applyCancelPlan({
		plan,
		cancelUpdates,
		defaultCustomerProduct,
		productToDelete,
		cancelLineItems,
		existingCustomerProduct: billingContext.customerProduct,
	});
};
