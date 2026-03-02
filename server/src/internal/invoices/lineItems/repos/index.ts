import { deleteByInvoiceId } from "./deleteByInvoiceId";
import { deleteStaleByStripeInvoiceId } from "./deleteStaleByStripeInvoiceId";
import { getByInvoiceId } from "./getByInvoiceId";
import { getByInvoiceIds } from "./getByInvoiceIds";
import { getByStripeInvoiceId } from "./getByStripeInvoiceId";
import { insertMany } from "./insertMany";
import { reconcileMany } from "./reconcileMany";
import {
	getDeferredByInvoiceItemIds,
	updateDeferredLineItem,
} from "./updateDeferredByInvoiceItemIds";
import { upsertMany } from "./upsertMany";

export const invoiceLineItemRepo = {
	insertMany,
	upsertMany,
	reconcileMany,
	getByInvoiceId,
	getByInvoiceIds,
	getByStripeInvoiceId,
	deleteByInvoiceId,
	deleteStaleByStripeInvoiceId,
	getDeferredByInvoiceItemIds,
	updateDeferredLineItem,
};
