import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { InvoiceService } from "../InvoiceService.js";

/**
 * Redirect to Stripe hosted invoice URL
 * Public route - no authentication required
 */
export const handleRedirectToInvoice = createRoute({
	handler: async (c) => {
		const { db } = c.get("ctx");
		const { invoiceId } = c.req.param();

		const invoice = await InvoiceService.get({
			db,
			id: invoiceId,
		});

		if (!invoice) {
			throw new RecaseError({
				message: "Invoice not found",

				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		try {
			const org = invoice.customer.org;
			const env = invoice.customer.env;

			const stripeCli = createStripeCli({
				org,
				env,
			});

			const stripeInvoice = await stripeCli.invoices.retrieve(
				invoice.stripe_id,
			);

			if (stripeInvoice.status === "draft") {
				throw new RecaseError({
					message: "This invoice is in draft status and has no URL",
					code: ErrCode.InvalidRequest,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			if (!stripeInvoice.hosted_invoice_url) {
				throw new RecaseError({
					message: "This invoice has no hosted invoice URL",
					code: ErrCode.InvalidRequest,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			return c.redirect(stripeInvoice.hosted_invoice_url as string);
		} catch (error) {
			if (error instanceof RecaseError) {
				throw error;
			}

			throw new RecaseError({
				message: "Error retrieving invoice",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
			});
		}
	},
});
