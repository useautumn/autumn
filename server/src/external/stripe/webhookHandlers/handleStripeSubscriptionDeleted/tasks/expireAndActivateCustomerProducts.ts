import {
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
	isCustomerProductFree,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
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
 * 3. Cache expired products so invoice.created can access them
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

	const expiredCustomerProducts: FullCusProduct[] = [];
	for (const customerProduct of customerProducts) {
		// 1. If not on stripe subscription, skip
		const onStripeSubscription = isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: stripeSubscription.id,
		});

		if (!onStripeSubscription) continue;

		// 2. Expire and activate default product if needed
		const { updates, activatedDefault } =
			await customerProductActions.expireAndActivateDefault({
				ctx,
				customerProduct,
				fullCustomer,
			});

		expiredCustomerProducts.push(customerProduct);

		trackCustomerProductUpdate({
			eventContext,
			customerProduct,
			updates,
		});

		// Find scheduled main product in the same group
		const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
			fullCustomer,
			productGroup: customerProduct.product.group,
			internalEntityId: customerProduct.internal_entity_id ?? undefined,
		});

		if (scheduledCustomerProduct) {
			const scheduledIsFreeCustomerProduct = isCustomerProductFree(
				scheduledCustomerProduct,
			);
			// const scheduledIsPaidCustomerProduct = isCustomerProductPaid(
			// 	scheduledCustomerProduct,
			// );

			if (scheduledIsFreeCustomerProduct && !activatedDefault) {
				const { updates: activateScheduledUpdates } =
					await customerProductActions.activateScheduled({
						ctx,
						customerProduct: scheduledCustomerProduct,
						fullCustomer,
					});

				trackCustomerProductUpdate({
					eventContext,
					customerProduct: scheduledCustomerProduct,
					updates: activateScheduledUpdates,
				});
			} else {
				await CusProductService.delete({
					db: ctx.db,
					cusProductId: scheduledCustomerProduct.id,
				});
				trackCustomerProductDeletion({
					eventContext,
					customerProduct: scheduledCustomerProduct,
				});
			}
		}
	}

	/**
	 * Need to cache expired customer products to invoice.created can access them
	 * invoice.created creates a final invoice for usage-based prices
	 */
	await customerProductActions.expiredCache.set({
		stripeSubscriptionId: stripeSubscription.id,
		customerProducts: expiredCustomerProducts,
	});
};
