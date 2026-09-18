import {
	AffectedResource,
	ReissueInvoiceParamsSchema,
	type ReissueInvoiceResponse,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { invoiceActions } from "../actions/index.js";
import { invoiceLineItemRepo } from "../lineItems/repos/index.js";
import { invoiceListRowToApi } from "../utils/invoiceListRowToApi.js";

export const handleReissueInvoice = createRoute({
	scopes: [Scopes.Billing.Write],
	body: ReissueInvoiceParamsSchema,
	resource: AffectedResource.Invoice,
	lock: {
		ttlMs: 60_000,
		errorMessage: "This invoice is already being reissued, try again shortly",
		getKey: (c) => {
			const ctx = c.get("ctx");
			const { invoice_id } = c.req.valid("json");
			return `reissue_invoice:${ctx.org.id}:${ctx.env}:${invoice_id}`;
		},
	},
	handler: async (c) => {
		const ctx = c.get("ctx");
		const {
			invoice_id,
			invoice_template_id,
			net_terms_days,
			update_customer_email,
			preview,
			invoice,
			customer,
			lines,
		} = c.req.valid("json");

		const {
			replacement,
			voidedInvoiceId,
			preview: previewTotals,
		} = await invoiceActions.reissue({
			ctx,
			invoiceId: invoice_id,
			invoiceTemplateId: invoice_template_id,
			netTermsDays: net_terms_days,
			updateCustomerEmail: update_customer_email,
			preview,
			invoiceOverrides: invoice,
			customerOverrides: customer,
			lineEdits: lines,
		});

		if (!replacement) {
			return c.json<ReissueInvoiceResponse>({
				invoice: null,
				voided_invoice_id: null,
				preview: previewTotals,
			});
		}

		const lineItems = await invoiceLineItemRepo.getByInvoiceIds({
			db: ctx.db,
			invoiceIds: [replacement.invoice.id],
		});

		return c.json<ReissueInvoiceResponse>({
			invoice: invoiceListRowToApi({ ctx, row: replacement, lineItems }),
			voided_invoice_id: voidedInvoiceId,
			preview: previewTotals,
		});
	},
});
