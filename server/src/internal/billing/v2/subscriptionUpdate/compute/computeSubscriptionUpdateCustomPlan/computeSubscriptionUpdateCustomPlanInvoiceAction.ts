import {
	type FullCusProduct,
	type SubscriptionUpdateV0Params,
	secondsToMs,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "../../../compute/computeAutumnUtils/buildAutumnLineItems";
import type { UpdateSubscriptionContext } from "../../fetch/updateSubscriptionContextSchema";
import { computeSubscriptionUpdateCustomPlanInvoiceRequired } from "./computeSubscriptionUpdateICustomPlanInvoiceRequired";

/**
 * Computes the invoice action for a custom subscription update.
 *
 * Determines what invoice operations (create, prorate, void, etc.) are needed
 * when a subscription is updated with custom item configurations.
 *
 * @param ctx - The Autumn request context
 * @param updateSubscriptionContext - Context containing customer product and subscription details
 * @param params - The subscription update parameters from the API request
 * @returns The computed invoice action to be executed
 */
export const computeSubscriptionUpdateCustomPlanInvoiceAction = ({
	ctx,
	updateSubscriptionContext,
	params,
	newFullCustomerProduct,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
	newFullCustomerProduct: FullCusProduct;
}) => {
	// 1. Early return and don't create an invoice

	const invoiceRequired = computeSubscriptionUpdateCustomPlanInvoiceRequired({
		ctx,
		updateSubscriptionContext,
		params,
	});

	if (!invoiceRequired) return undefined;

	const { customerProduct, stripeSubscription, testClockFrozenTime } =
		updateSubscriptionContext;

	// 2. Calculate line items
	const lineItems = buildAutumnLineItems({
		ctx,
		newCusProducts: [newFullCustomerProduct],
		ongoingCustomerProduct: customerProduct,
		billingCycleAnchor: secondsToMs(stripeSubscription?.billing_cycle_anchor),
		testClockFrozenTime,
	});

	// 3.

	console.log("New line items", lineItems);

	return {};
};
