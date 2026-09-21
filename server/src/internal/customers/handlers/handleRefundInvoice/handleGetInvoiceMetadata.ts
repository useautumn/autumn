import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { resolveVercelInstallationId } from "@/external/vercel/misc/vercelInvoiceUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";

/**
 * Dashboard-only: exposes Stripe invoice metadata (e.g. `vercel_invoice_id`)
 * so the invoice sheet can gate actions without a per-row Stripe call.
 */
export const handleGetInvoiceMetadata = createRoute({
	scopes: [Scopes.Customers.Read],
	params: z.object({
		customer_id: z.string(),
		stripe_invoice_id: z.string(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { stripe_invoice_id } = c.req.param();

		const autumnInvoice = await InvoiceService.getByStripeId({
			db: ctx.db,
			stripeId: stripe_invoice_id,
		});
		if (!autumnInvoice) {
			throw new RecaseError({
				message: "Invoice not found",
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const stripeInvoice = await stripeCli.invoices.retrieve(stripe_invoice_id);
		const vercelInstallationId = await resolveVercelInstallationId({
			stripeCli,
			invoice: stripeInvoice,
		});

		return c.json({
			metadata: {
				...(stripeInvoice.metadata ?? {}),
				...(vercelInstallationId
					? { vercel_installation_id: vercelInstallationId }
					: {}),
			},
		});
	},
});
