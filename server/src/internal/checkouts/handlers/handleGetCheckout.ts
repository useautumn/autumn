import type { Checkout, GetCheckoutResponse } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { previewCheckoutAction } from "../utils/previewCheckoutAction/previewCheckoutAction";

const getAdjustableFeatureIds = ({ checkout }: { checkout: Checkout }) => {
	if (!("feature_quantities" in checkout.params)) {
		return [];
	}

	return (
		checkout.params.feature_quantities
			?.filter((featureQuantity) => featureQuantity.adjustable === true)
			.map((featureQuantity) => featureQuantity.feature_id) ?? []
	);
};

/**
 * GET /checkouts/:checkout_id
 *
 * Returns checkout preview data for the UI to render.
 * The checkout is already fetched and validated by the middleware.
 */
export const handleGetCheckout = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const checkout = c.get("checkout") as Checkout;
		const { billingContext, preview } = await previewCheckoutAction({
			ctx,
			checkout,
			params: checkout.params,
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
			adjustable_feature_ids: getAdjustableFeatureIds({ checkout }),
			entity: fullCustomer.entity
				? {
						id: fullCustomer.entity.id ?? fullCustomer.entity.internal_id,
						name: fullCustomer.entity.name || null,
					}
				: null,
		};

		return c.json(response);
	},
});
