import {
	AffectedResource,
	CreateInvoiceParamsSchema,
	type CreateInvoiceResponse,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { invoiceActions } from "../actions/index.js";
import { InvoiceService } from "../InvoiceService.js";
import { invoiceLineItemRepo } from "../lineItems/repos/index.js";
import { invoiceListRowToApi } from "../utils/invoiceListRowToApi.js";

export const handleCreateInvoice = createRoute({
	scopes: [Scopes.Billing.Write],
	body: CreateInvoiceParamsSchema,
	resource: AffectedResource.Invoice,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const { invoice, preview } = await invoiceActions.create({ ctx, params });
		if (!invoice) {
			return c.json<CreateInvoiceResponse>({ invoice: null, preview });
		}

		const [row, lineItems] = await Promise.all([
			InvoiceService.getListRowById({ ctx, id: invoice.id }),
			invoiceLineItemRepo.getByInvoiceIds({
				db: ctx.db,
				invoiceIds: [invoice.id],
			}),
		]);

		return c.json<CreateInvoiceResponse>({
			invoice: row ? invoiceListRowToApi({ ctx, row, lineItems }) : null,
			preview,
		});
	},
});
