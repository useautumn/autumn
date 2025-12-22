import type { SubscriptionUpdateV0Params } from "@shared/index";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { PriceService } from "@/internal/products/prices/PriceService";
import { executeCusProductActions } from "../../execute/executeAutumnActions/executeCusProductActions";
import { executeInvoiceAction } from "../../execute/executeInvoiceAction";
import { executeStripeSubAction } from "../../execute/executeStripeSubAction";
import type { SubscriptionUpdatePlan } from "../../typesOld";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";

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
	const { db, logger, org, env } = ctx;
	const { customerProduct, stripeCustomer, stripeSubscription } =
		updateSubscriptionContext;
	const {
		customEntitlements,
		customPrices,
		ongoingCusProductAction,
		stripeSubscriptionAction,
		quantityUpdateDetails,
		invoiceAction,
	} = subscriptionUpdatePlan;

	if (customEntitlements.length > 0) {
		logger.info("Inserting custom entitlements");
		await EntitlementService.insert({ db, data: customEntitlements });
	}

	if (customPrices.length > 0) {
		logger.info("Inserting custom prices");
		await PriceService.insert({ db, data: customPrices });
	}

	const isProductCanceled = customerProduct.canceled === true;
	if (isProductCanceled) {
		logger.info("Uncanceling subscription in Stripe");
		const stripeClient = createStripeCli({ org, env });
		await stripeClient.subscriptions.update(stripeSubscription.id, {
			cancel_at_period_end: false,
		});

		logger.info("Uncanceling customer product in Autumn");
		await CusProductService.update({
			db,
			cusProductId: customerProduct.id,
			updates: {
				canceled: false,
				canceled_at: null,
				ended_at: null,
			},
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
			stripeSubscriptionId: stripeSubscription.id,
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
