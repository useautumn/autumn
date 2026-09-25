import type { FullCusProduct } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import type { CustomerProductActivation } from "@/internal/customers/cusProducts/types/customerProductActivation";
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
	activation?: CustomerProductActivation;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	const { fullCustomer } = eventContext;

	const { updates, activation, insertedCustomerProduct } =
		await customerProductActions.expireAndActivateDefault({
			ctx,
			customerProduct,
			fullCustomer,
			activatedAt: eventContext.nowMs,
		});

	const expiredCustomerProduct = trackCustomerProductUpdate({
		eventContext,
		customerProduct,
		updates,
	});

	if (activation) {
		trackCustomerProductUpdate({
			eventContext,
			customerProduct: activation.before,
			updates: {
				status: activation.after.status,
				starts_at: activation.after.starts_at,
				subscription_ids: activation.after.subscription_ids,
				scheduled_ids: activation.after.scheduled_ids,
			},
		});
	}

	if (insertedCustomerProduct) {
		trackCustomerProductInsertion({
			eventContext,
			customerProduct: insertedCustomerProduct,
		});
	}

	return {
		expiredCustomerProduct,
		activation,
		insertedCustomerProduct,
	};
};
