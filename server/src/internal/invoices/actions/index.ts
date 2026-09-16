import { insertInvoices } from "./insertInvoices";
import { payInvoiceOutOfBand } from "./payOutOfBand";
import { updateInvoiceFromStripe } from "./updateFromStripe";
import { upsertInvoiceToDbAndCache } from "./upsertDbAndCache";
import { upsertInvoiceFromStripe } from "./upsertFromStripe";
import { voidInvoice } from "./voidInvoice";

export const invoiceActions = {
	insert: insertInvoices,
	payOutOfBand: payInvoiceOutOfBand,
	upsertFromStripe: upsertInvoiceFromStripe,
	updateFromStripe: updateInvoiceFromStripe,
	upsertToDbAndCache: upsertInvoiceToDbAndCache,
	void: voidInvoice,
} as const;
