import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { StripeSubAction } from "../../typesOld";

/**
 * Execute Stripe subscription item updates.
 * Handles creating, updating, and deleting subscription items.
 *
 * Extracted from:
 * - handleQuantityUpgrade.ts:168-187
 * - handleQuantityDowngrade.ts:168-172
 */
export const executeStripeSubscriptionUpdate = async ({
	ctx,
	stripeSubscriptionAction,
}: {
	ctx: AutumnContext;
	stripeSubscriptionAction: StripeSubAction;
}) => {
	const { org, env, logger } = ctx;
	const stripeClient = createStripeCli({ org, env });
	if (
		!stripeSubscriptionAction.items ||
		stripeSubscriptionAction.items.length === 0
	) {
		logger.info("No subscription items to update");
		return;
	}

	logger.info(
		`Updating ${stripeSubscriptionAction.items.length} subscription items`,
	);

	for (const subscriptionItem of stripeSubscriptionAction.items) {
		if (subscriptionItem.deleted) {
			logger.info(`Deleting subscription item ${subscriptionItem.id}`);
			await stripeClient.subscriptionItems.del(subscriptionItem.id!);
		} else if (subscriptionItem.id) {
			logger.info(
				`Updating subscription item ${subscriptionItem.id} to quantity ${subscriptionItem.quantity}`,
			);
			await stripeClient.subscriptionItems.update(subscriptionItem.id, {
				quantity: subscriptionItem.quantity,
				proration_behavior: "none",
			});
		} else {
			logger.info(
				`Creating new subscription item for price ${subscriptionItem.price} with quantity ${subscriptionItem.quantity}`,
			);
			await stripeClient.subscriptionItems.create({
				subscription: stripeSubscriptionAction.subId!,
				price: subscriptionItem.price!,
				quantity: subscriptionItem.quantity,
				proration_behavior: "none",
			});
		}
	}

	logger.info("Successfully updated all subscription items");
};
