import { CheckoutAction } from "@autumn/shared";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { CheckoutUpdateContent } from "@/components/checkout-update/CheckoutUpdateContent";
import { CheckoutSharedContent } from "./CheckoutSharedContent";

export function CheckoutContent() {
	const { action } = useCheckoutContext();

	if (action === CheckoutAction.UpdateSubscription) {
		return <CheckoutUpdateContent />;
	}

	return <CheckoutSharedContent />;
}
