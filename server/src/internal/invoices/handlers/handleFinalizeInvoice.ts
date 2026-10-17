import {
	AffectedResource,
	FinalizeInvoiceParamsSchema,
	type FinalizeInvoiceResponse,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { checkRouteApproval } from "@/internal/approvals/check/checkRouteApproval.js";
import { buildInvoiceFacts } from "@/internal/approvals/facts/invoices/buildInvoiceFacts.js";
import { invoiceActions } from "../actions/index.js";
import { invoiceLineItemRepo } from "../lineItems/repos/index.js";
import { invoiceListRowToApi } from "../utils/invoiceListRowToApi.js";

export const handleFinalizeInvoice = createRoute({
	scopes: [Scopes.Billing.Write],
	body: FinalizeInvoiceParamsSchema,
	resource: AffectedResource.Invoice,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { invoice_id } = c.req.valid("json");

		await checkRouteApproval({
			ctx,
			action: "invoices.finalize",
			buildFacts: () => buildInvoiceFacts({ ctx, invoiceId: invoice_id }),
		});

		const row = await invoiceActions.finalize({ ctx, invoiceId: invoice_id });
		const lineItems = await invoiceLineItemRepo.getByInvoiceIds({
			db: ctx.db,
			invoiceIds: [row.invoice.id],
		});

		return c.json<FinalizeInvoiceResponse>({
			invoice: invoiceListRowToApi({ ctx, row, lineItems }),
		});
	},
});
