import type { PaymentFailureCode } from "@autumn/shared";

export const getCheckoutActionRequiredCopy = ({
	code,
}: {
	code: PaymentFailureCode;
}) => {
	switch (code) {
		case "payment_method_required":
			return {
				title: "Couldn't complete payment",
				description:
					"There isn't a payment method on file for this purchase. Add one to continue.",
				ctaLabel: "Complete payment",
			};
		case "3ds_required":
			return {
				title: "Verification required",
				description:
					"This payment needs extra verification before it can go through.",
				ctaLabel: "Complete payment",
			};
		case "payment_failed":
		default:
			return {
				title: "Couldn't complete payment",
				description:
					"Your payment was unsuccessful. Review your payment details to complete payment.",
				ctaLabel: "Complete payment",
			};
	}
};
