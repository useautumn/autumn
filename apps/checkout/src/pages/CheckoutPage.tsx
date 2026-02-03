import { useParams } from "react-router-dom";
import { CheckoutContent } from "@/components/checkout/CheckoutContent";
import { CheckoutErrorState } from "@/components/checkout/states/CheckoutErrorState";
import { CheckoutProvider } from "@/contexts/CheckoutContext";

export function CheckoutPage() {
	const { checkoutId: checkoutIdParam } = useParams<{ checkoutId: string }>();
	const checkoutId = checkoutIdParam ?? "";

	if (!checkoutId) {
		return <CheckoutErrorState message="Missing checkout ID" />;
	}

	return (
		<CheckoutProvider checkoutId={checkoutId}>
			<CheckoutContent />
		</CheckoutProvider>
	);
}
