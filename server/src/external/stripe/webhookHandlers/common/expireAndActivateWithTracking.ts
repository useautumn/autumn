import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import {
	trackCustomerProductInsertion,
	trackCustomerProductUpdate,
} from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/billingChangeCollector";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import type { StripeSubscriptionDeletedContext } from "../handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import type { StripeSubscriptionUpdatedContext } from "../handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";

type SubscriptionEventContext =
	| StripeSubscriptionUpdatedContext
	| StripeSubscriptionDeletedContext;

/** Expires a product, activates its free successor, and records both transitions. */
export const expireAndActivateWithTracking = async ({
	ctx,
	eventContext,
	customerProduct,
}: {
	ctx: StripeWebhookContext;
	eventContext: SubscriptionEventContext;
	customerProduct: FullCusProduct;
}): Promise<{
	expiredCustomerProduct: FullCusProduct;
	activatedCustomerProduct?: FullCusProduct;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	const { fullCustomer } = eventContext;

	const { updates, activatedCustomerProduct, insertedCustomerProduct } =
		await customerProductActions.expireAndActivateDefault({
			ctx,
			customerProduct,
			fullCustomer,
		});

	// Track expired product (UPDATE)
	const expiredCustomerProduct = trackCustomerProductUpdate({
		collector: eventContext,
		customerProduct,
		updates,
	});

	// Track activated scheduled product (UPDATE: scheduled → active)
	if (activatedCustomerProduct) {
		trackCustomerProductUpdate({
			collector: eventContext,
			customerProduct: activatedCustomerProduct,
			updates: { status: CusProductStatus.Active },
		});
	}

	// Track inserted default product (INSERT)
	if (insertedCustomerProduct) {
		trackCustomerProductInsertion({
			collector: eventContext,
			customerProduct: insertedCustomerProduct,
		});
	}

	return {
		expiredCustomerProduct,
		activatedCustomerProduct,
		insertedCustomerProduct,
	};
};
