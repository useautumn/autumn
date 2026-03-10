import {
	type Checkout,
	type ConfirmCheckoutParams,
	ConfirmCheckoutParamsSchema,
	type GetCheckoutResponse,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { augmentCheckoutParams } from "../utils/augmentCheckoutParams";
import { previewCheckoutAction } from "../utils/previewCheckoutAction/previewCheckoutAction";

/**
 * POST /checkouts/:checkout_id/preview
 *
 * Returns updated checkout preview with new feature quantities.
 * Used for inline quantity editing in the checkout UI.
 */
export const handlePreviewCheckout = createRoute({
	body: ConfirmCheckoutParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const checkout = c.get("checkout") as Checkout;
		const body = c.req.valid("json") as ConfirmCheckoutParams;
		const params = augmentCheckoutParams({
			checkout,
			body,
		});
		const { billingContext, preview } = await previewCheckoutAction({
			ctx,
			checkout,
			params,
		});
		const { fullCustomer } = billingContext;

		const response: GetCheckoutResponse = {
			env: checkout.env,
			action: checkout.action,
			status: checkout.status,
			response: checkout.response ?? null,
			preview,
			org: {
				name: ctx.org.name,
				logo: ctx.org.logo || null,
			},
			customer: {
				id: fullCustomer.id || fullCustomer.internal_id,
				name: fullCustomer.name || null,
				email: fullCustomer.email || null,
			},
			entity: fullCustomer.entity
				? {
						id: fullCustomer.entity.id,
						name: fullCustomer.entity.name || null,
					}
				: null,
		};

		return c.json(response);
	},
});
