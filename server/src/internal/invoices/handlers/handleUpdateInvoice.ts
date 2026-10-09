import {
	AffectedResource,
	Scopes,
	UpdateInvoiceParamsSchema,
	type UpdateInvoiceResponse,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { invoiceActions } from "../actions/index.js";
import { invoiceLineItemRepo } from "../lineItems/repos/index.js";
import { invoiceListRowToApi } from "../utils/invoiceListRowToApi.js";

export const handleUpdateInvoice = createRoute({
	scopes: [Scopes.Billing.Write],
	body: UpdateInvoiceParamsSchema,
	resource: AffectedResource.Invoice,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { invoice_id, payment_method_types } = c.req.valid("json");

		const row = await invoiceActions.updatePaymentMethodTypes({
			ctx,
			invoiceId: invoice_id,
			paymentMethodTypes: payment_method_types,
		});
		const lineItems = await invoiceLineItemRepo.getByInvoiceIds({
			db: ctx.db,
			invoiceIds: [row.invoice.id],
		});

		return c.json<UpdateInvoiceResponse>({
			invoice: invoiceListRowToApi({ ctx, row, lineItems }),
		});
	},
});
