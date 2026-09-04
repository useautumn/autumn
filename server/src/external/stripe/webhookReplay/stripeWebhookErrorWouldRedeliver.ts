import { RecaseError } from "@autumn/shared";
import Stripe from "stripe";
import { handleWebhookErrorSkip } from "@/utils/routerUtils/webhookErrorSkip.js";

export const STRIPE_WEBHOOK_REPLAY_MAX_ATTEMPTS = 30;

/** True when the HTTP webhook path would 500 Stripe (so it retries). */
export const stripeWebhookErrorWouldRedeliver = ({
	error,
}: {
	error: unknown;
}): boolean => {
	if (handleWebhookErrorSkip({ error })) return false;
	if (error instanceof Stripe.errors.StripeError) return false;
	if (
		process.env.NODE_ENV === "development" &&
		error instanceof Error &&
		error.message.includes("No stripe account linked to organization")
	) {
		return false;
	}
	if (error instanceof RecaseError) return error.statusCode >= 500;
	return true;
};
