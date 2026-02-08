import { deleteCheckout } from "./deleteCheckout";
import { getCheckout } from "./getCheckout";
import { insertCheckout } from "./insertCheckout";
import { updateCheckout } from "./updateCheckout";

export const checkoutRepo = {
	get: getCheckout,
	insert: insertCheckout,
	update: updateCheckout,
	delete: deleteCheckout,
} as const;
