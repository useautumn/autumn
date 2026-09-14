import {
	AffectedResource,
	type ApiListInvoiceV1,
	type CursorPaginatedResponse,
	ErrCode,
	ListInvoicesParamsSchema,
	PaginationType,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getOrgPaginationMaxLimit } from "../../misc/edgeConfig/orgLimitsStore.js";
import { InvoiceService } from "../InvoiceService.js";
import { invoiceLineItemRepo } from "../lineItems/repos/index.js";
import { invoiceListRowToApi } from "../utils/invoiceListRowToApi.js";

export const handleListInvoices = createRoute({
	scopes: [Scopes.Customers.Read],
	body: ListInvoicesParamsSchema,
	resource: AffectedResource.Invoice,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const maxLimit = getOrgPaginationMaxLimit({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
			type: PaginationType.ListInvoices,
		});
		if (body.limit > maxLimit) {
			throw new RecaseError({
				message: `limit ${body.limit} exceeds max of ${maxLimit} for this org`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const { rows, nextCursor } = await InvoiceService.getCursorPage({
			ctx,
			query: body,
		});

		const lineItems = await invoiceLineItemRepo.getByInvoiceIds({
			db: ctx.db,
			invoiceIds: rows.map((row) => row.invoice.id),
		});

		const list: ApiListInvoiceV1[] = rows.map((row) =>
			invoiceListRowToApi({
				ctx,
				row,
				lineItems: lineItems.filter((li) => li.invoice_id === row.invoice.id),
			}),
		);

		return c.json<CursorPaginatedResponse<ApiListInvoiceV1>>({
			list,
			next_cursor: nextCursor,
		});
	},
});
