import {
	AffectedResource,
	IssueCreditNoteParamsSchema,
	type IssueCreditNoteResponse,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { invoiceActions } from "../actions/index.js";

export const handleIssueCreditNote = createRoute({
	scopes: [Scopes.Billing.Write],
	body: IssueCreditNoteParamsSchema,
	resource: AffectedResource.Invoice,
	lock: {
		ttlMs: 60_000,
		errorMessage:
			"A credit note is already being issued for this invoice, try again shortly",
		getKey: (c) => {
			const ctx = c.get("ctx");
			const { invoice_id } = c.req.valid("json");
			return `issue_credit_note:${ctx.org.id}:${ctx.env}:${invoice_id}`;
		},
	},
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const creditNote = await invoiceActions.issueCreditNote({ ctx, params });

		return c.json<IssueCreditNoteResponse>({ credit_note: creditNote });
	},
});
