import {
	type AttachParamsV0,
	type Checkout,
	CheckoutAction,
	ErrCode,
	type GetCheckoutResponse,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { billingPlanToChanges } from "@/internal/billing/v2/utils/billingPlanToChanges.js";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse.js";

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

		if (checkout.action !== CheckoutAction.Attach) {
			throw new RecaseError({
				message: "Only attach checkouts are supported",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const params = checkout.params as AttachParamsV0;

		// Re-run attach in preview mode to get current billing plan
		const { billingContext, billingPlan } = await billingActions.attach({
			ctx,
			params,
			preview: true,
		});

		if (!billingPlan) {
			throw new RecaseError({
				message: "Failed to compute billing plan",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
			});
		}

		const { fullCustomer } = billingContext;

		// Build preview with line items, total, currency, next_cycle
		const preview = billingPlanToPreviewResponse({
			ctx,
			billingContext,
			billingPlan,
		});

		// Build changes array
		const { incoming, outgoing } = await billingPlanToChanges({
			ctx,
			billingContext,
			billingPlan,
		});

		const response: GetCheckoutResponse = {
			env: checkout.env,
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
			incoming,
			outgoing,
		};

		return c.json(response);
	},
});
