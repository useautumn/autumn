import {
	type AttachParamsV0,
	type Checkout,
	CheckoutAction,
	CheckoutStatus,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { deleteCheckoutCache } from "../actions/cache";
import { checkoutRepo } from "../repos/checkoutRepo";

/**
 * POST /checkouts/:checkout_id/confirm
 *
 * Executes the billing plan stored in the checkout.
 * - Re-runs attach with the stored params (not preview mode)
 * - Deletes checkout from cache (one-time use)
 * - Updates DB status to completed (audit)
 * - Returns success with billing result
 */
export const handleConfirmCheckout = createRoute({
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

		try {
			// Execute attach (not preview mode)
			const { billingContext, billingResult } = await attach({
				ctx,
				params,
				preview: false,
			});

			// Delete from cache (one-time use)
			await deleteCheckoutCache({ checkoutId: checkout.id });

			// Update DB status to completed (audit)
			await checkoutRepo.update({
				db: ctx.db,
				id: checkout.id,
				updates: {
					status: CheckoutStatus.Completed,
					completed_at: Date.now(),
				},
			});

			return c.json({
				success: true,
				checkout_id: checkout.id,
				customer_id: checkout.customer_id,
				product_id: billingContext.attachProduct.id,
				invoice_id: billingResult?.stripe?.stripeInvoice?.id ?? null,
			});
		} catch (error) {
			// Don't delete from cache on error - allow retry
			if (error instanceof RecaseError) {
				throw error;
			}

			throw new RecaseError({
				message: "Failed to process checkout",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
			});
		}
	},
});
