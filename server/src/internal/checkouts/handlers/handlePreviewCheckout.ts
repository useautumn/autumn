import {
	type AttachParamsV1,
	type Checkout,
	CheckoutAction,
	ErrCode,
	FeatureOptionsSchema,
	type GetCheckoutResponse,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { billingPlanToChanges } from "@/internal/billing/v2/utils/billingPlanToChanges.js";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse.js";

const PreviewCheckoutBodySchema = z.object({
	options: z.array(
		FeatureOptionsSchema.pick({
			feature_id: true,
			quantity: true,
		}),
	),
});

/**
 * POST /checkouts/:checkout_id/preview
 *
 * Returns updated checkout preview with new feature quantities.
 * Used for inline quantity editing in the checkout UI.
 */
export const handlePreviewCheckout = createRoute({
	body: PreviewCheckoutBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const checkout = c.get("checkout") as Checkout;
		const body = c.req.valid("json");

		if (checkout.action !== CheckoutAction.Attach) {
			throw new RecaseError({
				message: "Only attach checkouts are supported",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const originalParams = checkout.params as AttachParamsV1;

		// Merge provided options with original params
		const params: AttachParamsV1 = {
			...originalParams,
			feature_quantities: body.options,
		};

		// Re-run attach in preview mode with updated options
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

		// Build incoming/outgoing changes
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
