import { createInvoice } from "./create/createInvoice";
import { issueCreditNote } from "./creditNote/issueCreditNote";
import { finalizeInvoice } from "./finalizeInvoice";
import { insertInvoices } from "./insertInvoices";
import { payInvoiceOutOfBand } from "./payOutOfBand";
import { reissueInvoice } from "./reissueInvoice";
import { updateInvoiceFromStripe } from "./updateFromStripe";
import { updateInvoicePaymentMethodTypes } from "./updateInvoicePaymentMethodTypes";
import { upsertInvoiceToDbAndCache } from "./upsertDbAndCache";
import { upsertInvoiceFromStripe } from "./upsertFromStripe";
import { voidInvoice } from "./voidInvoice";

export const invoiceActions = {
	create: createInvoice,
	finalize: finalizeInvoice,
	insert: insertInvoices,
	issueCreditNote,
	payOutOfBand: payInvoiceOutOfBand,
	reissue: reissueInvoice,
	upsertFromStripe: upsertInvoiceFromStripe,
	updateFromStripe: updateInvoiceFromStripe,
	updatePaymentMethodTypes: updateInvoicePaymentMethodTypes,
	upsertToDbAndCache: upsertInvoiceToDbAndCache,
	void: voidInvoice,
} as const;
