import { confirmCheckout } from "./confirmCheckout";
import { getCheckoutFromCacheOrDb } from "./getFromCacheOrDb";
import { updateCheckoutDbAndCache } from "./updateDbAndCache";

export const checkoutActions = {
	confirm: confirmCheckout,
	getFromCacheOrDb: getCheckoutFromCacheOrDb,
	updateDbAndCache: updateCheckoutDbAndCache,
};
