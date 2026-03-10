import { CheckoutAction } from "../../models/checkouts/checkoutTable";

export const checkoutToUrl = ({
	checkoutBaseUrl = "http://localhost:3001",
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
