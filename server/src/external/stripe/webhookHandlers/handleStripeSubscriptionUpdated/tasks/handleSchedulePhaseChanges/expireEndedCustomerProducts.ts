import { hasCustomerProductEnded } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { trackCustomerProductUpdate } from "../../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

/**
 * Expires customer products that have ended (based on ended_at time).
 * Also activates default product if no other active product exists in the same group.
 */
export const expireEndedCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { logger } = ctx;
	const { customerProducts, fullCustomer, nowMs } = eventContext;

	for (const customerProduct of customerProducts) {
		if (!hasCustomerProductEnded(customerProduct, { nowMs })) continue;

		logger.info(
			`Expiring product: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

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
	}
};
