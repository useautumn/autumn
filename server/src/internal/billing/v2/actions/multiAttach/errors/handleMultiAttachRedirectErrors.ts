import { RecaseError } from "@autumn/shared";
import type Stripe from "stripe";

export const handleMultiAttachRedirectErrors = ({
	redirectMode,
	stripeSubscription,
}: {
	redirectMode: string;
	stripeSubscription?: Stripe.Subscription;
}) => {
	if (redirectMode === "always" && stripeSubscription) {
		throw new RecaseError({
			message:
				'redirect_mode cannot be "always" if customer has an existing Stripe subscription. Pass new_billing_subscription: true to create a new subscription.',
			code: "invalid_redirect_mode",
			statusCode: 400,
		});
	}
};
