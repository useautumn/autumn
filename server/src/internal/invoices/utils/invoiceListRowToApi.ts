import type { ApiListInvoiceV1, DbInvoiceLineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { type InvoiceListRow, processInvoice } from "../InvoiceService.js";
import { dbLineItemsToApiInvoiceItems } from "../lineItems/utils/dbLineItemsToApiInvoiceItems.js";

export const invoiceListRowToApi = ({
	ctx,
	row,
	lineItems,
}: {
	ctx: AutumnContext;
	row: InvoiceListRow;
	lineItems: DbInvoiceLineItem[];
}): ApiListInvoiceV1 => ({
	...processInvoice({ invoice: row.invoice }),
	id: row.invoice.id,
	customer_id: row.customer_id,
	entity_id: row.entity_id,
	amount_paid: row.invoice.amount_paid ?? null,
	refunded_amount: row.invoice.refunded_amount,
	items: dbLineItemsToApiInvoiceItems({ lineItems, features: ctx.features }),
});
