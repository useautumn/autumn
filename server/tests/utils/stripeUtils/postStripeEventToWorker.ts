import type { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";

const backendUrl = () =>
	process.env.AUTUMN_BACKEND_URL || "http://localhost:8080";

/** Self-delivers a Stripe event; needs STRIPE_WEBHOOK_SKIP_VERIFY (set for `bun tw` workers and local dev). */
export const postStripeEventToWorker = async ({
	env,
	event,
}: {
	env: AppEnv;
	event: Stripe.Event;
}): Promise<string> => {
	const response = await fetch(
		// NO org_id: with it, getStripeWebhookSecret takes the DB path and tw
		// deliberately stores no connect secret, so the request 500s before
		// skip-verify is even consulted. The ingress omits it too.
		`${backendUrl()}/webhooks/connect/${env}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(event),
		},
	);
	// The body carries the handler's own error; µVM stdout stops at the health
	// check, so this response is the only channel for it.
	const detail = response.ok
		? ""
		: `: ${(await response.text()).slice(0, 300)}`;
	return `${event.id}→${response.status}${detail}`;
};
