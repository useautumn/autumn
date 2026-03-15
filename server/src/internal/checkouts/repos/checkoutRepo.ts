import { deleteCheckout } from "./deleteCheckout";
import { getByStripeInvoiceId } from "./getByStripeInvoiceId";
import { getCheckout } from "./getCheckout";
import { insertCheckout } from "./insertCheckout";
import { updateCheckout } from "./updateCheckout";

export const checkoutRepo = {
	get: getCheckout,
	getByStripeInvoiceId,
	insert: insertCheckout,
	update: updateCheckout,
	delete: deleteCheckout,
} as const;
