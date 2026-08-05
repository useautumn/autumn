import { type ApiCustomerV3, ApiVersion } from "@autumn/shared";
import { timeout } from "@tests/utils/genUtils.js";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/**
 * Wait until the Stripe webhooks an operation kicked off have already been
 * delivered, BEFORE the test tracks usage.
 *
 * Why this exists
 * ---------------
 * `/track` deducts in Redis and syncs to Postgres asynchronously; `syncItemV4`
 * re-reads the Redis balance hash to build that write. Any full-subject
 * invalidation landing in the ~1–2s track→sync window makes the read miss and
 * the balance write is DROPPED — the deduction then exists nowhere and cycle-end
 * billing underbills (see `waitForUsageInDb.ts`).
 *
 * `stripeWebhookRefreshMiddleware` deletes the cached full customer on every one
 * of the events listed below, so the invalidations that land in that window are
 * the tail of the PRECEDING operation (an attach, an advance, a cancel). Locally
 * they arrive ~1s after the attach — comfortably before the track. Under `bun tw`
 * the hop is Stripe → one shared ingress sandbox → the µVM and takes far longer,
 * landing squarely inside the window. Sequencing them ahead of the track is what
 * makes those tests deterministic; the Postgres gate afterwards only diagnoses.
 *
 * The signal
 * ----------
 * Stripe's own `Event.pending_webhooks`: the number of endpoint deliveries still
 * outstanding for that event. Polling this customer's invalidating events until
 * every one reads zero is a POSITIVE observation ("Stripe has handed all of them
 * over"), not a sleep — it returns on the first poll when nothing is pending.
 *
 * Its one gap, stated plainly: under `bun tw` the registered endpoint is the
 * shared ingress (`scripts/tw/ingress/server.mjs`), which ACKS 200 immediately
 * and forwards to the owning worker asynchronously. So zero-pending means "Stripe
 * delivered", not "the µVM finished processing"; `forwardSettleMs` covers that
 * last hop, which is a single in-cloud fetch rather than Stripe's queue. That
 * turns an unbounded 30s+ unknown into a bounded, observed wait.
 *
 * Never throws and never asserts: a Stripe hiccup, a customer with no Stripe id,
 * or a ceiling hit all return a result the caller may ignore. The test's own
 * assertions — including the Postgres gate — remain what decides pass/fail.
 */

const isParallelRun = () =>
	Number(process.env.TEST_FILE_CONCURRENCY || "0") > 1;

/**
 * Only bounds how long a stuck delivery costs — polling exits as soon as nothing
 * is pending. Parallel runs share one ingress and Stripe retries a miss on its
 * own backoff, so they get the bigger ceiling.
 */
const quiesceTimeoutMs = () => (isParallelRun() ? 45_000 : 10_000);

/** Ingress ack → worker forward → handler. One in-cloud hop, not Stripe's queue. */
const forwardSettleMs = () => (isParallelRun() ? 2000 : 500);

/**
 * Stripe is rate-limited per key under `bun tw` (~6 rps shared by ~4 worker
 * processes), so poll it sparsely.
 */
const POLL_INTERVAL_MS = 2500;

/** How far back to look for this customer's events. Covers a whole scenario's
 * setup without dragging in an unbounded slice of the sub-account's history. */
const DEFAULT_LOOKBACK_MS = 120_000;

const EVENT_PAGE_SIZE = 100;
/** Events are filtered to ONE customer client-side, so the page may hold other
 * tests' events too; two pages is plenty at the concurrency `bun tw` runs. */
const MAX_EVENT_PAGES = 2;

/**
 * Exactly the events `stripeWebhookRefreshMiddleware` deletes the cached full
 * customer on (`coreEvents` + `updateProductEvents` + `updateInvoiceEvents`).
 * Anything else Stripe emits cannot drop a deduction, so waiting on it would be
 * pure cost. Stripe caps `types` at 20.
 */
const INVALIDATING_EVENT_TYPES = [
	"checkout.session.completed",
	"customer.subscription.created",
	"customer.subscription.deleted",
	"customer.subscription.updated",
	"invoice.created",
	"invoice.finalized",
	"invoice.paid",
	"invoice.updated",
	"subscription_schedule.canceled",
	"subscription_schedule.updated",
];

/** Same version the `stripe_id` lookup was written against. */
const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

export type QuiesceResult = {
	/** True only when every matched event reported zero pending deliveries. */
	settled: boolean;
	/** Invalidating events seen for this customer in the lookback window. */
	matchedEvents: number;
	/** Event types still undelivered when the ceiling was hit. */
	pendingEventTypes: string[];
	/** Set when the signal was unavailable rather than unsettled. */
	reason?: "no-stripe-customer" | "stripe-error" | "timeout";
};

const eventCustomerId = (event: Stripe.Event): string | undefined => {
	const object = event.data.object as {
		customer?: string | { id?: string } | null;
	};
	const customer = object?.customer;
	if (typeof customer === "string") return customer;
	return customer?.id ?? undefined;
};

/**
 * One sweep of this customer's invalidating events. Throws only on a Stripe
 * failure, which the caller turns into "signal unavailable".
 */
const sweepPendingEvents = async ({
	stripeCli,
	stripeCustomerId,
	createdGteSec,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
	createdGteSec: number;
}): Promise<{ matched: number; pending: string[] }> => {
	const pending: string[] = [];
	let matched = 0;
	let startingAfter: string | undefined;

	for (let page = 0; page < MAX_EVENT_PAGES; page++) {
		const list = await stripeCli.events.list({
			created: { gte: createdGteSec },
			types: INVALIDATING_EVENT_TYPES,
			limit: EVENT_PAGE_SIZE,
			...(startingAfter ? { starting_after: startingAfter } : {}),
		});

		for (const event of list.data) {
			if (eventCustomerId(event) !== stripeCustomerId) continue;
			matched += 1;
			if (event.pending_webhooks > 0) pending.push(event.type);
		}

		if (!list.has_more || list.data.length === 0) break;
		startingAfter = list.data[list.data.length - 1]?.id;
	}

	return { matched, pending };
};

/**
 * Sequence the preceding operation's webhooks ahead of whatever the test does
 * next (normally a `/track`).
 *
 * @example
 * await quiesceCustomerWebhooks({ stripeCli: ctx.stripeCli, customerId });
 * await autumn.track({ customer_id: customerId, feature_id: f, value: 500 });
 * await waitForCustomerUsageInDb({ autumn, customerId, featureId: f, balance: -400 });
 */
export const quiesceCustomerWebhooks = async ({
	stripeCli,
	customerId,
	stripeCustomerId,
	autumn,
	lookbackMs = DEFAULT_LOOKBACK_MS,
	timeoutMs = quiesceTimeoutMs(),
	/**
	 * How many of this customer's invalidating events must have been seen before
	 * "nothing pending" counts. An operation that mints none (a free attach) will
	 * never reach 1, so callers in that shape should pass 0.
	 */
	minEvents = 1,
}: {
	stripeCli: Stripe;
	customerId: string;
	/** Skips the Autumn lookup when the caller already has it. */
	stripeCustomerId?: string;
	autumn?: AutumnInt;
	lookbackMs?: number;
	timeoutMs?: number;
	minEvents?: number;
}): Promise<QuiesceResult> => {
	const client = autumn ?? defaultAutumn;

	let resolvedStripeCustomerId = stripeCustomerId;
	if (!resolvedStripeCustomerId) {
		try {
			const customer = await client.customers.get<ApiCustomerV3>(customerId);
			resolvedStripeCustomerId = customer.stripe_id ?? undefined;
		} catch {
			return {
				settled: false,
				matchedEvents: 0,
				pendingEventTypes: [],
				reason: "stripe-error",
			};
		}
	}

	if (!resolvedStripeCustomerId) {
		// No Stripe customer means no Stripe webhooks, so nothing can invalidate.
		return { settled: true, matchedEvents: 0, pendingEventTypes: [] };
	}

	const createdGteSec = Math.floor((Date.now() - lookbackMs) / 1000);
	const deadline = Date.now() + timeoutMs;
	let lastSweep = { matched: 0, pending: [] as string[] };

	while (true) {
		try {
			lastSweep = await sweepPendingEvents({
				stripeCli,
				stripeCustomerId: resolvedStripeCustomerId,
				createdGteSec,
			});
		} catch {
			// Rate limit, transient 5xx, an account the key cannot read — treat the
			// signal as unavailable rather than burning the ceiling on it.
			return {
				settled: false,
				matchedEvents: lastSweep.matched,
				pendingEventTypes: lastSweep.pending,
				reason: "stripe-error",
			};
		}

		if (lastSweep.pending.length === 0 && lastSweep.matched >= minEvents) {
			// Stripe is done; pay for the ingress → worker → handler tail once, then
			// warm the full-customer cache so the coming track writes into a hash
			// that was just rebuilt rather than one about to be deleted.
			await timeout(forwardSettleMs());
			try {
				await client.customers.get<ApiCustomerV3>(customerId);
			} catch {
				// Warming is an optimisation; a failed read is not a reason to fail.
			}
			return {
				settled: true,
				matchedEvents: lastSweep.matched,
				pendingEventTypes: [],
			};
		}

		if (Date.now() >= deadline) {
			return {
				settled: false,
				matchedEvents: lastSweep.matched,
				pendingEventTypes: lastSweep.pending,
				reason: "timeout",
			};
		}

		await timeout(POLL_INTERVAL_MS);
	}
};
