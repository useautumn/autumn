import { secondsToMs } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import type { AttachContext } from "../types";
import { buildAutumnLineItems } from "./computeAutumnUtils/buildAutumnLineItems";
import { buildNewCusProducts } from "./computeAutumnUtils/buildNewCusProducts";
import { buildStripeCheckoutAction } from "./computeStripeUtils/buildStripeCheckoutAction";
import { buildStripeInvoiceAction } from "./computeStripeUtils/buildStripeInvoiceAction";
import { buildStripeSubAction } from "./computeStripeUtils/buildStripeSubAction";

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
	const autumnLineItems = buildAutumnLineItems({
		ctx,
		newCusProducts,
		ongoingCusProductAction,
		billingCycleAnchor,
		testClockFrozenTime,
	});

	// 3. Build updateOneOff action
	// const updateOneOffAction = buildUpdateOneOffAction({
	// 	ctx,
	// 	attachContext,
	// 	newCusProducts,
	// });

	// 4. Build stripe checkout action
	const stripeCheckoutAction = buildStripeCheckoutAction({
		ctx,
		attachContext,
		newCusProducts,
	});

	// 5. Build stripe sub action
	const stripeSubAction = buildStripeSubAction({
		ctx,
		stripeSub: attachContext.stripeSub!,
		fullCus: attachContext.fullCus,
		paymentMethod: attachContext.paymentMethod,
		ongoingCusProductAction,
		newCusProducts,
	});

	// 6. Build stripe invoice action
	const stripeInvoiceAction = buildStripeInvoiceAction({
		attachContext,
		autumnLineItems,
		stripeSubAction,
		newCusProducts,
	});

	return {
		autumnLineItems,

		ongoingCusProductAction,
		scheduledCusProductAction,
		newCusProducts,

		stripeSubAction,
		stripeInvoiceAction,
		stripeCheckoutAction,
	};
};
