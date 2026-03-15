import { CheckoutErrorCode } from "@autumn/shared";
import {
	getCheckoutApiErrorCode,
	getCheckoutApiErrorMessage,
} from "@/utils/checkoutApiErrorUtils";

const FALLBACK_MESSAGE = "Failed to load checkout";

export const checkoutErrorToDisplay = ({ error }: { error: unknown }) => {
	const code = getCheckoutApiErrorCode({ error });

	switch (code) {
		case CheckoutErrorCode.CheckoutCompleted:
			return {
				variant: "completed" as const,
				title: "Checkout complete",
				message: "This checkout link has already been completed.",
			};
		case CheckoutErrorCode.CheckoutExpired:
			return {
				variant: "expired" as const,
				title: "Checkout expired",
				message: "This checkout link has expired. Create a new checkout to continue.",
			};
		case CheckoutErrorCode.CheckoutUnavailable:
			return {
				variant: "unavailable" as const,
				title: "Checkout unavailable",
				message: "This checkout link is invalid or no longer available.",
			};
		default:
			return {
				variant: "generic" as const,
				title: "Something went wrong",
				message: getCheckoutApiErrorMessage({
					error,
					fallbackMessage: FALLBACK_MESSAGE,
				}),
			};
	}
};
