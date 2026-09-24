import { withTimeout } from "@autumn/shared";
import type Stripe from "stripe";

export const readTwStripeRateLimitCode = async ({
	response,
	timeoutMs,
}: {
	response: Stripe.HttpClientResponse;
	timeoutMs: number;
}): Promise<string | null> => {
	const body = response.toJSON();
	// The SDK still needs the original error body if this is the final attempt.
	response.toJSON = () => body;
	const payload = (await withTimeout({
		fn: () => body,
		timeoutMs,
		timeoutMessage: "TW Stripe error response exceeded the request deadline",
	})) as { error?: { code?: unknown } };
	const code = payload?.error?.code;
	return typeof code === "string" && /^[a-z_]{1,80}$/.test(code) ? code : null;
};
