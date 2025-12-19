import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import type { StripeSubAction } from "../types";
import { executeStripeSubscriptionUpdate } from "./executeStripeSubscriptionActions/executeStripeSubscriptionUpdate";

export const executeStripeSubAction = async ({
	ctx,
	stripeSubAction,
}: {
	ctx: AutumnContext;
	stripeSubAction: StripeSubAction;
}) => {
	const { logger } = ctx;

	switch (stripeSubAction.type) {
		case "update":
			logger.info("Executing Stripe subscription update");
			return await executeStripeSubscriptionUpdate({
				ctx,
				stripeSubscriptionAction: stripeSubAction,
			});

		case "create":
			logger.info("Executing Stripe subscription create");
			throw new Error("Stripe subscription create not yet implemented");

		case "cancel_immediately":
			logger.info("Executing Stripe subscription cancel immediately");
			throw new Error(
				"Stripe subscription cancel immediately not yet implemented",
			);

		case "cancel_at_period_end":
			logger.info("Executing Stripe subscription cancel at period end");
			throw new Error(
				"Stripe subscription cancel at period end not yet implemented",
			);

		case "none":
			logger.info("No Stripe subscription action required");
			return;

		default:
			throw new Error(
				`Unknown Stripe subscription action type: ${stripeSubAction.type}`,
			);
	}
};
