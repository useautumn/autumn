import { CheckoutAction } from "../../models/checkouts/checkoutTable";

const DEFAULT_CHECKOUT_BASE_URL =
	process.env.NODE_ENV === "production"
		? "https://checkout.useautumn.com"
		: "http://localhost:3001";

export const checkoutToUrl = ({
	checkoutBaseUrl = DEFAULT_CHECKOUT_BASE_URL,
	action,
	checkoutId,
}: {
	checkoutBaseUrl?: string;
	action: CheckoutAction;
	checkoutId: string;
}): string => {
	const checkoutPath = action === CheckoutAction.UpdateSubscription ? "u" : "c";

	return `${checkoutBaseUrl}/${checkoutPath}/${checkoutId}`;
};
