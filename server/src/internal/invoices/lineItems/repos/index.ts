import { deleteByInvoiceId } from "./deleteByInvoiceId";
import { deleteStaleByStripeInvoiceId } from "./deleteStaleByStripeInvoiceId";
import { getByCustomerProductAndPeriod } from "./getByCustomerProductAndPeriod";
import { getByCustomerProductIds } from "./getByCustomerProductIds";
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
	getByCustomerProductAndPeriod,
	getByCustomerProductIds,
	deleteByInvoiceId,
	deleteStaleByStripeInvoiceId,
	getDeferredByInvoiceItemIds,
	updateDeferredLineItem,
};
