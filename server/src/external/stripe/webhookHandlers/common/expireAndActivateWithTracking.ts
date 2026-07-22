import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import type { StripeSubscriptionDeletedContext } from "../handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import type { StripeSubscriptionUpdatedContext } from "../handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import {
	trackCustomerProductInsertion,
	trackCustomerProductUpdate,
} from "./trackCustomerProductUpdate";

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
		eventContext,
		customerProduct,
		updates,
	});

	// Track activated scheduled product (UPDATE: scheduled → active)
	if (activatedCustomerProduct) {
		trackCustomerProductUpdate({
			eventContext,
			customerProduct: activatedCustomerProduct,
			updates: { status: CusProductStatus.Active },
		});
	}

	// Track inserted default product (INSERT)
	if (insertedCustomerProduct) {
		trackCustomerProductInsertion({
			eventContext,
			customerProduct: insertedCustomerProduct,
		});
	}

	return {
		expiredCustomerProduct,
		activatedCustomerProduct,
		insertedCustomerProduct,
	};
};
