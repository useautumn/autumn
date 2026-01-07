import { secondsToMs } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import type { AttachContext } from "../typesOld";
import { buildAutumnLineItems } from "./computeAutumnUtils/buildAutumnLineItems";
import { buildNewCusProducts } from "./computeAutumnUtils/buildNewCusProducts";

/**
 * Shared logic by attach, cancel and
 */
export const computeAttachPlan = async ({
	ctx,
	attachContext,
}: {
	ctx: AutumnContext;
	attachContext: AttachContext;
}) => {
	const {
		fullCus,
		products,
		ongoingCusProductAction,
		scheduledCusProductAction,
	} = attachContext;

	// 1. Build new cus products
	const newCusProducts = buildNewCusProducts({
		ctx,
		attachContext,
	});

	const billingCycleAnchor = secondsToMs(
		attachContext.stripeSub?.billing_cycle_anchor,
	);
	const testClockFrozenTime = attachContext.testClockFrozenTime;

	// When to build checkout action?

	// 2. Build autumn line items
	const lineItems = buildAutumnLineItems({
		ctx,
		newCusProducts,
		ongoingCustomerProduct: ongoingCusProductAction?.cusProduct,
		billingCycleAnchor,
		testClockFrozenTime,
	});

	// 3. Build updateOneOff action
	// const updateOneOffAction = buildUpdateOneOffAction({
	// 	ctx,
	// 	attachContext,
	// 	newCusProducts,
	// });

	// 5. Build stripe sub action
	const stripeSubAction = undefined;

	// 6. Build stripe invoice action
	// const stripeInvoiceAction = buildStripeInvoiceAction({
	// 	attachContext,
	// 	lineItems,
	// 	stripeSubAction,
	// 	newCusProducts,
	// });

	return {
		lineItems,

		ongoingCusProductAction,
		scheduledCusProductAction,
		newCusProducts,

		stripeSubAction,
	};
};
