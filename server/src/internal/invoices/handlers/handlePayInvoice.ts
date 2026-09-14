import {
	AffectedResource,
	PayInvoiceParamsSchema,
	type PayInvoiceResponse,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { invoiceActions } from "../actions/index.js";
import { invoiceLineItemRepo } from "../lineItems/repos/index.js";
import { invoiceListRowToApi } from "../utils/invoiceListRowToApi.js";

export const handlePayInvoice = createRoute({
	scopes: [Scopes.Billing.Write],
	body: PayInvoiceParamsSchema,
	resource: AffectedResource.Invoice,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { invoice_id } = c.req.valid("json");

		const row = await invoiceActions.payOutOfBand({
			ctx,
			invoiceId: invoice_id,
		});
		const lineItems = await invoiceLineItemRepo.getByInvoiceIds({
			db: ctx.db,
			invoiceIds: [row.invoice.id],
		});

		return c.json<PayInvoiceResponse>({
			invoice: invoiceListRowToApi({ ctx, row, lineItems }),
		});
	},
});
