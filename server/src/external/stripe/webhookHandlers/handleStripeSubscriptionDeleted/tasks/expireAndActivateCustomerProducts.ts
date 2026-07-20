import {
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
	isCustomerProductOnStripeSubscription,
	isCustomerProductPaid,
	isCustomerProductScheduled,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { deleteScheduledCustomerProduct } from "@/internal/customers/cusProducts/actions/deleteScheduledCustomerProduct";
import {
	expireAndActivateWithTracking,
	trackCustomerProductDeletion,
} from "../../common";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";

/** Expires live products, then activates or removes their scheduled successors. */
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

	const expiredCustomerProducts: FullCusProduct[] = [];
	const liveCustomerProducts = customerProducts.filter(
		(customerProduct) => !isCustomerProductScheduled(customerProduct),
	);
	for (const customerProduct of liveCustomerProducts) {
		// 1. If not on stripe subscription, skip
		const onStripeSubscription = isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: stripeSubscription.id,
		});

		if (!onStripeSubscription) continue;

		// 2. Expire and activate free successor (with tracking)
		const { expiredCustomerProduct } = await expireAndActivateWithTracking({
			ctx,
			eventContext,
			customerProduct,
		});

		expiredCustomerProducts.push(expiredCustomerProduct);

		// 3. Delete paid scheduled customer product for this group if it exists...
		const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
			fullCustomer,
			productGroup: customerProduct.product.group,
			internalEntityId: customerProduct.internal_entity_id ?? undefined,
		});

		if (
			scheduledCustomerProduct &&
			isCustomerProductPaid(scheduledCustomerProduct)
		) {
			await deleteScheduledCustomerProduct({
				ctx,
				customerProduct: scheduledCustomerProduct,
				fullCustomer,
			});

			trackCustomerProductDeletion({
				eventContext,
				customerProduct: scheduledCustomerProduct,
			});
		}
	}

	// invoice.created needs the expired snapshots for final usage billing.
	await customerProductActions.expiredCache.set({
		stripeSubscriptionId: stripeSubscription.id,
		customerProducts: expiredCustomerProducts,
	});
};
