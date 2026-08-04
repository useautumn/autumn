import type { AppEnv } from "@autumn/shared";
import { timeout } from "@tests/utils/genUtils.js";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect.js";
import type Stripe from "stripe";

/** Stripe delivers to ONE shared ingress sandbox before the µVM, and retries a
 * miss on its own backoff — so give up on delivery well before the deadline and
 * post the event ourselves. */
const DEFAULT_REPLAY_AFTER_MS = 25_000;
const POLL_INTERVAL_MS = 2_000;

const backendUrl = () =>
	process.env.AUTUMN_BACKEND_URL || "http://localhost:8080";

/**
 * Waits for Autumn to reflect a Stripe webhook, and self-delivers if it doesn't.
 *
 * `until` is the observable effect (product active, invoice paid, …) — NOT the
 * event itself, since a delivered-but-unprocessed event is the same failure.
 * Once `replayAfterMs` passes without the effect, matching events are pulled
 * from Stripe and POSTed to this worker's connect webhook, which removes
 * Stripe's retry backoff from the critical path. Replay only happens when the
 * effect is still missing, so a normally-delivered event is never reprocessed.
 *
 * Requires STRIPE_WEBHOOK_SKIP_VERIFY (set for `bun tw` workers and local dev) —
 * without it the unsigned POST is rejected and this degrades to plain waiting.
 */
export const waitForStripeWebhook = async ({
	stripeCli,
	orgId,
	env,
	until,
	types,
	since,
	timeoutMs = WEBHOOK_SETTLE_TIMEOUT_MS,
	replayAfterMs = DEFAULT_REPLAY_AFTER_MS,
}: {
	stripeCli: Stripe;
	orgId: string;
	env: AppEnv;
	/** The observable effect of the webhook having been processed. */
	until: () => Promise<boolean>;
	/** Event types to replay, e.g. ["checkout.session.completed"]. */
	types: string[];
	/** Only replay events created at/after this epoch (defaults to 10 min ago). */
	since?: number;
	timeoutMs?: number;
	replayAfterMs?: number;
}): Promise<void> => {
	const startedAt = Date.now();
	const createdGte = Math.floor((since ?? startedAt - 10 * 60 * 1000) / 1000);
	let replayed = false;

	while (true) {
		if (await until()) return;

		const elapsed = Date.now() - startedAt;
		if (elapsed >= timeoutMs) {
			throw new Error(
				`Timed out after ${timeoutMs}ms waiting for ${types.join(", ")}` +
					`${replayed ? " (events were replayed and still had no effect)" : ""}`,
			);
		}

		if (!replayed && elapsed >= replayAfterMs) {
			replayed = true;
			await replayStripeEvents({ stripeCli, orgId, env, types, createdGte });
		}

		await timeout(POLL_INTERVAL_MS);
	}
};

const replayStripeEvents = async ({
	stripeCli,
	orgId,
	env,
	types,
	createdGte,
}: {
	stripeCli: Stripe;
	orgId: string;
	env: AppEnv;
	types: string[];
	createdGte: number;
}): Promise<void> => {
	const events = await stripeCli.events.list({
		types,
		created: { gte: createdGte },
		limit: 25,
	});

	for (const event of events.data.reverse()) {
		const response = await fetch(
			`${backendUrl()}/webhooks/connect/${env}?org_id=${orgId}`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(event),
			},
		);
		console.log(
			`[waitForStripeWebhook] replayed ${event.type} (${event.id}) → ${response.status}`,
		);
	}
};
