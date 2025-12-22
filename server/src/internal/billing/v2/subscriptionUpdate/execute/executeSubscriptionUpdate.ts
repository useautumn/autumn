import type { SubscriptionUpdateV0Params } from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SubscriptionUpdatePlan } from "@/internal/billing/v2/typesOld";
import { executeCusProductActions } from "../../execute/executeAutumnActions/executeCusProductActions";
import { executeInvoiceAction } from "../../execute/executeInvoiceAction";
import { executeStripeSubAction } from "../../execute/executeStripeSubAction";
import { executeStripeSubscriptionUncancel } from "../../execute/executeStripeSubscriptionActions/executeStripeSubscriptionUncancel";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";

/**
 * Executes the subscription update flow in stripe & autumn using context & plan.
 *
 * @param ctx - The context object.
 * @param params - The parameters for the subscription update.
 * @param updateSubscriptionContext - The context object for the subscription update.
 * @param subscriptionUpdatePlan - The plan for the subscription update.
 * @returns A promise that resolves when the subscription update is complete.
 */
export const executeSubscriptionUpdate = async ({
	ctx,
	params,
	updateSubscriptionContext,
	subscriptionUpdatePlan,
}: {
	ctx: AutumnContext;
	params: SubscriptionUpdateV0Params;
	updateSubscriptionContext: UpdateSubscriptionContext;
	subscriptionUpdatePlan: SubscriptionUpdatePlan;
}) => {
	const { logger } = ctx;
	const { customerProduct, stripeCustomer, stripeSubscription } =
		updateSubscriptionContext;
	const {
		ongoingCusProductAction,
		stripeSubscriptionAction,
		quantityUpdateDetails,
		invoiceAction,
		shouldUncancelSubscription,
	} = subscriptionUpdatePlan;

	if (shouldUncancelSubscription) {
		await executeStripeSubscriptionUncancel({
			ctx,
			stripeSubscriptionId: stripeSubscription?.id ?? "",
			customerProduct,
		});
	}

	logger.info("Executing Stripe subscription action");
	await executeStripeSubAction({
		ctx,
		stripeSubAction: stripeSubscriptionAction,
	});

	if (invoiceAction) {
		logger.info("Executing invoice action");
		await executeInvoiceAction({
			ctx,
			invoiceAction,
			stripeCustomerId: stripeCustomer.id,
			stripeSubscriptionId: stripeSubscription?.id ?? "",
			customerProduct,
		});
	} else {
		logger.info("No invoice action required");
	}

	logger.info("Executing customer product actions");
	await executeCusProductActions({
		ctx,
		ongoingCusProductAction,
		newCusProducts: [],
		quantityUpdateDetails,
		updatedFeatureOptions: params.options || [],
	});

	logger.info("Successfully completed subscription update");
};
