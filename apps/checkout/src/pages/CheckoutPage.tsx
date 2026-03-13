import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { CheckoutContent } from "@/components/checkout/CheckoutContent";
import { CheckoutProvider } from "@/contexts/CheckoutContext";
import type { CheckoutRouteMode } from "@/utils/checkoutRouteMode";

export function CheckoutPage({ routeMode }: { routeMode: CheckoutRouteMode }) {
	const { checkoutId: checkoutIdParam } = useParams<{ checkoutId: string }>();
	const checkoutId = checkoutIdParam ?? "";

	useEffect(() => {
		if (!checkoutId) {
			window.location.href = "https://useautumn.com";
		}
	}, [checkoutId]);

	if (!checkoutId) {
		return null;
	}

	return (
		<CheckoutProvider checkoutId={checkoutId} routeMode={routeMode}>
			<CheckoutContent />
		</CheckoutProvider>
	);
}
