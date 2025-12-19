import type { SubscriptionUpdateV0Params } from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { PriceService } from "@/internal/products/prices/PriceService";
import { executeCusProductActions } from "../../execute/executeAutumnActions/executeCusProductActions";
import { executeStripeSubAction } from "../../execute/executeStripeSubAction";
import type { SubscriptionUpdatePlan } from "../../types";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";

export const executeSubscriptionUpdate = async (
	ctx: AutumnContext,
	{
		params,
		updateSubscriptionContext,
		subscriptionUpdatePlan,
	}: {
		params: SubscriptionUpdateV0Params;
		updateSubscriptionContext: UpdateSubscriptionContext;
		subscriptionUpdatePlan: SubscriptionUpdatePlan;
	},
) => {
	const { db, logger } = ctx;
	const { customerProduct } = updateSubscriptionContext;
	const {
		customEntitlements,
		customPrices,
		ongoingCusProductAction,
		stripeSubscriptionAction,
	} = subscriptionUpdatePlan;

	await EntitlementService.insert({
		db,
		data: customEntitlements,
	});

	await PriceService.insert({
		db,
		data: customPrices,
	});

	logger.info("Executing stripe sub action");
	await executeStripeSubAction({
		ctx,
		stripeSubAction: stripeSubscriptionAction,
	});

	logger.info("Executing cus product actions");
	await executeCusProductActions({
		ctx,
		ongoingCusProductAction,
		newCusProducts: [customerProduct],
	});
};
