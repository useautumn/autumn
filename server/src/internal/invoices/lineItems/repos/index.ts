import { deleteByInvoiceId } from "./deleteByInvoiceId";
import { getByInvoiceId } from "./getByInvoiceId";
import { getByStripeInvoiceId } from "./getByStripeInvoiceId";
import { insertMany } from "./insertMany";

export const invoiceLineItemRepo = {
	insertMany,
	getByInvoiceId,
	getByStripeInvoiceId,
	deleteByInvoiceId,
};
