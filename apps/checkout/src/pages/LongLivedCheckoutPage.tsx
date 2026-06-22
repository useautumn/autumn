import { useEffect } from "react";
import { useParams } from "react-router-dom";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8080";

export function LongLivedCheckoutPage() {
	const { checkoutId } = useParams<{ checkoutId: string }>();

	useEffect(() => {
		window.location.assign(
			checkoutId
				? `${apiUrl}/checkouts/${checkoutId}/start`
				: "https://useautumn.com",
		);
	}, [checkoutId]);

	return null;
}
