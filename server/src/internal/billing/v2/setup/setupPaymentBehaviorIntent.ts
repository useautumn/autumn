import type {
	BillingContextOverride,
	PaymentBehaviorIntent,
} from "@autumn/shared";
import type Stripe from "stripe";

export const setupPaymentBehaviorIntent = ({
	contextOverride,
	paymentMethod,
}: {
	contextOverride?: BillingContextOverride;
	paymentMethod?: Stripe.PaymentMethod | null;
}): PaymentBehaviorIntent => {
	if (contextOverride?.paymentBehaviorIntent) {
		return contextOverride.paymentBehaviorIntent;
	}

	if (!paymentMethod || paymentMethod.type === "custom") {
		return "default_incomplete";
	}

	return "allow_incomplete";
};
