import { CusProductStatus, hasCustomerProductEnded } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { expireAndActivateWithTracking } from "../../../common";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

export const expireEndedCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { logger } = ctx;
	const { customerProducts, stripeSubscription, nowMs, fullCustomer } =
		eventContext;

	const endedCustomerProducts = customerProducts.filter((customerProduct) =>
		hasCustomerProductEnded(customerProduct, { nowMs }),
	);
	if (endedCustomerProducts.length === 0) return;

	await customerProductActions.expiredCache.set({
		ctx,
		stripeSubscriptionId: stripeSubscription.id,
		customerProducts: endedCustomerProducts.map((customerProduct) => ({
			...customerProduct,
			status: CusProductStatus.Expired,
		})),
	});

	for (const customerProduct of endedCustomerProducts) {
		logger.info(
			`Expiring product: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		const carryOver = await customerProductActions.preserveOneOffPrepaid({
			ctx,
			customerProduct,
			fullCustomer,
		});
		if (carryOver.preservedCount > 0) {
			eventContext.oneOffPrepaidCarryOvers.push({
				customerProductId: customerProduct.id,
				productName: customerProduct.product.name,
				preservedCount: carryOver.preservedCount,
				preservedFeatureIds: carryOver.preservedFeatureIds,
			});
		}

		await expireAndActivateWithTracking({
			ctx,
			eventContext,
			customerProduct,
		});
	}
};
