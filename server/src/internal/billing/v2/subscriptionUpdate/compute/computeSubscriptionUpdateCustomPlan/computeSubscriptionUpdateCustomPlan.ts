import {
	cusProductToProduct,
	type SubscriptionUpdateV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { UpdateSubscriptionContext } from "@server/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";
import { computeSubscriptionUpdateNewCustomerProduct } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateNewCustomerProduct";
import { computeCustomFullProduct } from "../../../compute/computeAutumnUtils/computeCustomFullProduct";

export const computeSubscriptionUpdateCustomPlan = async ({
	ctx,
	subscriptionUpdateContext,
	params,
}: {
	ctx: AutumnContext;
	subscriptionUpdateContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}) => {
	// 1. Compute the override plan
	const { customerProduct } = subscriptionUpdateContext;

	const currentFullProduct = cusProductToProduct({
		cusProduct: customerProduct,
	});

	const {
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	} = await computeCustomFullProduct({
		ctx,
		currentFullProduct,
		customItems: params.items,
	});

	// 2. Compute the new customer product
	const newFullCustomerProduct = computeSubscriptionUpdateNewCustomerProduct({
		ctx,
		subscriptionUpdateContext,
		params,
		fullProduct: customFullProduct,
	});

	// // 2. Compute the invoice action
	// const invoiceAction = computeSubscriptionUpdateCustomPlanInvoiceAction({
	// 	ctx,
	// 	updateSubscriptionContext,
	// 	newFullCustomerProduct,
	// 	params,
	// });

	return newFullCustomerProduct;
};
