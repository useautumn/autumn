import type { AppEnv } from "@autumn/shared";
import { timeout } from "@tests/utils/genUtils.js";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect.js";
import type Stripe from "stripe";

/** Stripe delivers to ONE shared ingress sandbox before the µVM, and retries a
 * miss on its own backoff — so give up on delivery well before the deadline and
 * post the event ourselves. */
const DEFAULT_REPLAY_AFTER_MS = 25_000;
const POLL_INTERVAL_MS = 2_000;

const CHECKOUT_SESSION_ID_RE = /(cs_[A-Za-z0-9_]+)/;

/** Pull the session id out of an attach `checkout_url`, to scope a replay. */
export const checkoutSessionIdFromUrl = (url: string): string => {
	const id = CHECKOUT_SESSION_ID_RE.exec(url)?.[1];
	if (!id) throw new Error(`No checkout session id in URL: ${url}`);
	return id;
};

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
	env,
	until,
	types,
	since,
	objectId,
	customerStripeId,
	describeOnTimeout,
	timeoutMs = WEBHOOK_SETTLE_TIMEOUT_MS,
	replayAfterMs = DEFAULT_REPLAY_AFTER_MS,
}: {
	stripeCli: Stripe;
	env: AppEnv;
	/** The observable effect of the webhook having been processed. */
	until: () => Promise<boolean>;
	/** Event types to replay, e.g. ["checkout.session.completed"]. */
	types: string[];
	/** Only replay events created at/after this epoch (defaults to 10 min ago). */
	since?: number;
	/**
	 * Narrows the replay to THIS test's events. Without it, concurrent tests in
	 * one file each re-post every matching event on the shared account, so the
	 * same event is processed several times at once — which 500s on duplicate
	 * inserts and corrupts state. Pass the object id (e.g. the checkout session).
	 */
	objectId?: string;
	/** Same purpose as `objectId`, for events whose object hangs off a customer
	 * (invoices) rather than being the thing the test holds an id for. */
	customerStripeId?: string;
	/** Extra context for the timeout error, e.g. the Stripe-side invoice status.
	 * Only called on failure. */
	describeOnTimeout?: () => Promise<string>;
	timeoutMs?: number;
	replayAfterMs?: number;
}): Promise<void> => {
	const startedAt = Date.now();
	const createdGte = Math.floor((since ?? startedAt - 10 * 60 * 1000) / 1000);
	let replayReport: string | undefined;

	while (true) {
		if (await until()) return;

		const elapsed = Date.now() - startedAt;
		if (elapsed >= timeoutMs) {
			// The count travels in the message because µVM stdout is not captured:
			// "Stripe had 0" (event never created) and "posted 3, no effect"
			// (handler ignored it) are completely different diagnoses.
			const description = describeOnTimeout
				? ` — ${await describeOnTimeout().catch((error) => `describe failed: ${error}`)}`
				: "";

			throw new Error(
				`Timed out after ${timeoutMs}ms waiting for ${types.join(", ")}` +
					(replayReport === undefined
						? " (no replay attempted)"
						: ` (replay: ${replayReport} — still no effect)`) +
					description,
			);
		}

		if (replayReport === undefined && elapsed >= replayAfterMs) {
			replayReport = await replayStripeEvents({
				stripeCli,
				env,
				types,
				createdGte,
				objectId,
				customerStripeId,
			});
		}

		await timeout(POLL_INTERVAL_MS);
	}
};

const replayStripeEvents = async ({
	stripeCli,
	env,
	types,
	createdGte,
	objectId,
	customerStripeId,
}: {
	stripeCli: Stripe;
	env: AppEnv;
	types: string[];
	createdGte: number;
	objectId?: string;
	customerStripeId?: string;
}): Promise<string> => {
	const events = await stripeCli.events.list({
		types,
		created: { gte: createdGte },
		limit: 25,
	});
	console.log(
		`[waitForStripeWebhook] stripe had ${events.data.length} event(s) matching ${types.join(", ")}`,
	);

	const isMine = (event: Stripe.Event) => {
		const object = event.data.object as {
			id?: string;
			customer?: string | { id?: string };
		};
		if (objectId) return object.id === objectId;
		if (customerStripeId) {
			const owner =
				typeof object.customer === "string"
					? object.customer
					: object.customer?.id;
			return owner === customerStripeId;
		}
		return true;
	};

	const mine = events.data.filter(isMine);

	if (mine.length === 0 && events.data.length > 0) {
		// "none matched" is ambiguous — say what was there, so a scoping mistake
		// is distinguishable from the event genuinely never firing.
		const owners = events.data
			.map((event) => {
				const object = event.data.object as {
					id?: string;
					customer?: string | { id?: string };
				};
				const owner =
					typeof object.customer === "string"
						? object.customer
						: object.customer?.id;
				return `${object.id}/${owner ?? "no-customer"}`;
			})
			.slice(0, 6);
		return `0/${events.data.length} — wanted ${objectId ?? customerStripeId}, saw [${owners.join(", ")}]`;
	}

	const statuses: string[] = [];
	for (const event of mine.reverse()) {
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
		statuses.push(`${event.id}→${response.status}${detail}`);
	}
	// Statuses travel in the caller's error because µVM stdout never reaches the
	// orchestrator; a 200 that changes nothing is a very different bug from a 4xx.
	return `${mine.length}/${events.data.length} event(s) [${statuses.join(", ")}]`;
};
