import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import type { AttachContext, AttachPlan } from "../typesOld";
import { applyCusProductActions } from "./executeAutumnActions/applyCusProductActions";
import { executeStripeCheckoutAction } from "./executeStripeCheckoutAction";
import { executeStripeInvoiceAction } from "./executeStripeInvoiceAction";
import { executeStripeSubAction } from "./executeStripeSubAction";

export const executeAttachActions = async ({
	ctx,
	attachPlan,
	attachContext,
}: {
	ctx: AutumnContext;
	attachPlan: AttachPlan;
	attachContext: AttachContext;
}) => {
	const { org, env, logger } = ctx;
	const {
		stripeSubAction,
		stripeInvoiceAction,
		ongoingCusProductAction,
		scheduledCusProductAction,

		stripeCheckoutAction,
	} = attachPlan;

	logger.info(`executing attach actions: `, {
		checkoutInfo: {
			shouldCreate: stripeCheckoutAction?.shouldCreate,
			reason: stripeCheckoutAction?.reason,
		},
		ongoingCusProductAction: {
			action: ongoingCusProductAction?.action,
			cusProduct: ongoingCusProductAction?.cusProduct.product.id,
		},
		scheduledCusProductAction: scheduledCusProductAction
			? {
					action: scheduledCusProductAction.action,
					cusProduct: scheduledCusProductAction.cusProduct.product.id,
				}
			: undefined,
		newFullCusProducts: attachPlan.newCusProducts.map((cp) => cp.product.id),
		stripeSubAction,
		stripeInvoiceAction: stripeInvoiceAction ?? "none",
	});

	// throw new RecaseError({
	// 	message: `test`,
	// });

	if (stripeCheckoutAction.shouldCreate) {
		return await executeStripeCheckoutAction({
			ctx,
			stripeCheckoutAction,
		});
	}

	// 1. Create invoice if necessary
	if (stripeInvoiceAction) {
		await executeStripeInvoiceAction({
			ctx,
			attachContext,
			stripeCheckoutAction,
			stripeInvoiceAction,
		});
	}

	// 2. Execute stripe sub action
	if (stripeSubAction) {
		await executeStripeSubAction({
			ctx,
			stripeSubAction,
		});
	}

	// 3. Apply cus product actions
	await applyCusProductActions({
		ctx,
		ongoingCusProductAction,
		scheduledCusProductAction,
		newCusProducts: attachPlan.newCusProducts,
	});
};
