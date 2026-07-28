import { insertInvoices } from "./insertInvoices";
import { updateInvoiceFromStripe } from "./updateFromStripe";
import { upsertInvoiceToDbAndCache } from "./upsertDbAndCache";
import { upsertInvoiceFromStripe } from "./upsertFromStripe";

export const invoiceActions = {
	insert: insertInvoices,
	upsertFromStripe: upsertInvoiceFromStripe,
	updateFromStripe: updateInvoiceFromStripe,
	upsertToDbAndCache: upsertInvoiceToDbAndCache,
} as const;
