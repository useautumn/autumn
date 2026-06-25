import { CheckoutAction } from "../../models/checkouts/checkoutTable";
import {
	CHECKOUT_ACTION_PATHS,
	LONG_LIVED_CHECKOUT_PATH,
} from "./checkoutPaths";

const DEFAULT_CHECKOUT_BASE_URL =
	process.env.NODE_ENV === "production"
		? "https://checkout.useautumn.com"
		: "http://localhost:3001";

const getCheckoutPath = ({
	action,
	longLived,
}: {
	action: CheckoutAction;
	longLived: boolean;
}) => {
	if (longLived) return LONG_LIVED_CHECKOUT_PATH;
	return CHECKOUT_ACTION_PATHS[action];
};

export const checkoutToUrl = ({
	checkoutBaseUrl = DEFAULT_CHECKOUT_BASE_URL,
	action,
	checkoutId,
	longLived = false,
}: {
	checkoutBaseUrl?: string;
	action: CheckoutAction;
	checkoutId: string;
	longLived?: boolean;
}): string => {
	const checkoutPath = getCheckoutPath({ action, longLived });

	return `${checkoutBaseUrl}/${checkoutPath}/${checkoutId}`;
};
