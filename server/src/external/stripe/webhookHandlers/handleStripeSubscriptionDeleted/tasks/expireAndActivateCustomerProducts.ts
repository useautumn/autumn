import { isCustomerProductOnStripeSubscription } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import {
	trackCustomerProductDeletion,
	trackCustomerProductUpdate,
} from "../../common";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";

/**
 * Handles customer product state changes when a subscription is deleted.
 *
 * For each customer product on the deleted subscription:
 * 1. Expire the customer product and activate default if needed
 * 2. Delete any scheduled main customer product in the same group
 */
export const expireAndActivateCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionDeletedContext;
}): Promise<void> => {
	const { logger } = ctx;
	const { customerProducts, fullCustomer, stripeSubscription } = eventContext;

	logger.info(
		`[sub.deleted] Processing ${customerProducts.length} customer products for subscription ${stripeSubscription.id}`,
	);

	for (const customerProduct of customerProducts) {
		// 1. If not on stripe subscription, skip
		const onStripeSubscription = isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: stripeSubscription.id,
		});

		if (!onStripeSubscription) continue;

		// 2. Expire and activate default product if needed
		const { updates } = await customerProductActions.expireAndActivateDefault({
			ctx,
			customerProduct,
			fullCustomer,
		});

		trackCustomerProductUpdate({
			eventContext,
			customerProduct,
			updates,
		});

		// 3. Delete scheduled main product in the same group
		const { deletedCustomerProduct } =
			await customerProductActions.deleteScheduled({
				ctx,
				customerProduct,
				fullCustomer,
			});

		if (deletedCustomerProduct) {
			trackCustomerProductDeletion({
				eventContext,
				customerProduct: deletedCustomerProduct,
			});
		}
	}
};
