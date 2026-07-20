import {
	type FullCustomerLicense,
	findCustomerProductById,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import type { BatchTransitionContext } from "../types/types";

export const setupBatchTransitionContext = async ({
	ctx,
	customerLicense,
}: {
	ctx: AutumnContext;
	customerLicense: FullCustomerLicense;
}): Promise<BatchTransitionContext> => {
	const fullProduct = customerLicense.planLicense?.product;
	if (!fullProduct) {
		throw new Error("Plan license is required for a batch transition");
	}

	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerLicense.internal_customer_id },
		withEntities: false,
	});
	const parentCustomerProduct = findCustomerProductById({
		fullCustomer,
		customerProductId: customerLicense.parent_customer_product_id,
	});
	if (!parentCustomerProduct) {
		throw new Error(
			"Parent customer product is required for a batch transition",
		);
	}

	const { stripeSubscription, testClockFrozenTime } =
		await setupStripeBillingContext({
			ctx,
			fullCustomer,
			targetCustomerProduct: parentCustomerProduct,
			createStripeCustomerIfMissing: false,
		});
	const currentEpochMs = testClockFrozenTime ?? Date.now();
	const billingCycleAnchorMs = setupBillingCycleAnchor({
		stripeSubscription,
		customerProduct: parentCustomerProduct,
		newFullProduct: fullProduct,
		currentEpochMs,
	});
	const resetCycleAnchorMs = setupResetCycleAnchor({
		billingCycleAnchorMs,
		newFullProduct: fullProduct,
	});

	return {
		fullCustomer,
		parentCustomerProduct,
		currentEpochMs,
		resetCycleAnchorMs,
	};
};
