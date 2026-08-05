import type { Stripe } from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "./genUtils.js";

/**
 * Condition polling for Stripe test-clock advances.
 *
 * A clock advance used to be followed by a fixed blind sleep (20–110s) chosen to
 * be "long enough" for: Stripe generating + finalizing the period invoice →
 * webhook → Autumn workers → Autumn API state. That sleep is both the slowness
 * (most of a per-file wall time) and the flakiness (when the hop takes longer
 * than the sleep, assertions read stale state).
 *
 * The observable consequence of a cycle boundary is an invoice, so that is what
 * we poll for:
 *  - STRIPE side: a new invoice on the clock's customer(s), finalized (non-draft).
 *  - AUTUMN side: that same `stripe_id` present on the Autumn customer. This is
 *    the strong signal — `handleStripeInvoiceCreated` upserts the Autumn invoice
 *    LAST, after the consumable/prepaid/allocated/pooled balance resets, so
 *    seeing the invoice means the cycle work for that boundary is done.
 *
 * Nothing here throws on timeout: the ceiling only bounds how long a genuine
 * failure takes to surface, and the test's own assertions (ideally pollable, see
 * pollableCustomerExpect) are what decide pass/fail.
 */

const isParallelRun = () =>
	Number(process.env.TEST_FILE_CONCURRENCY || "0") > 1;

const CLOCK_READY_TIMEOUT_MS = 180_000;
const CLOCK_READY_POLL_MS = 3000;

/** Stripe calls are rate-limited per key in tw (see twStripeConcurrencyLimit:
 * 8 in flight / 6 rps shared by ~4 processes), so Stripe is polled sparsely and
 * Autumn — our own server — carries the tight loop. */
const STRIPE_POLL_INTERVAL_MS = 3000;
const AUTUMN_POLL_INTERVAL_MS = 1500;
const STRIPE_INVOICE_LIST_LIMIT = 30;
const STRIPE_CLOCK_CUSTOMER_LIMIT = 20;

/**
 * Generous, because it only bounds a genuine failure — polling exits as soon as
 * the invoice lands. Parallel runs share one ingress sandbox and Stripe retries
 * a missed webhook on its own backoff, so they get the bigger ceiling.
 */
export const invoiceSettleTimeoutMs = () =>
	isParallelRun() ? 120_000 : 45_000;

/**
 * Stripe generates the renewal invoice INSIDE the advance (the clock stays
 * `advancing` until its events are generated), so if nothing new exists shortly
 * after the clock is ready, this boundary produces no invoice at all — e.g. a
 * subscription that was cancelled at period end. Bail out instead of burning the
 * full ceiling.
 */
const noInvoiceGraceMs = () => (isParallelRun() ? 12_000 : 6_000);

/**
 * Boundary work Autumn does off OTHER events (customer.subscription.updated for
 * a scheduled product going active, subscription_schedule.*) is not covered by
 * the invoice signal, so keep a small floor for it. Per-test assertions should
 * poll for their own state rather than lean on this.
 */
const postSettleFloorMs = () => (isParallelRun() ? 5000 : 2000);

/**
 * `invoice.created` stores ONLY `subscription_cycle` invoices
 * (upsertAutumnInvoice's `skipNonCycleInvoices`); anything else lands later via
 * `invoice.paid`, or never. So a non-cycle invoice never gets the full ceiling.
 */
const NON_CYCLE_SIGNAL_TIMEOUT_MS = 20_000;

/**
 * Finalization happens inside Stripe (and inside the advance itself), so it is
 * not affected by how contended our own box is — if it hasn't happened shortly
 * after the clock is ready, this invoice is not on auto-advance and waiting
 * longer will not help. The long ceiling is for the webhook hop, not this.
 */
const STRIPE_FINALIZE_TIMEOUT_MS = 30_000;

/**
 * Call sites that hand `advanceTestClock` a long explicit wait (30s is by far
 * the most common) picked it to cover a cycle boundary — the exact problem this
 * file solves. Short waits (5–15s) were picked for something else, so they are
 * left alone.
 */
export const LEGACY_WAIT_POLL_THRESHOLD_MS = 20_000;

/**
 * Those call sites have not had their assertions made pollable yet, so they keep
 * a floor rather than returning the instant the invoice lands — boundary work
 * driven by OTHER webhooks (a scheduled product going active) is not covered by
 * the invoice signal.
 */
const legacyWaitFloorMs = () => (isParallelRun() ? 15_000 : 10_000);

const CYCLE_BILLING_REASON = "subscription_cycle";
const MAX_AUTUMN_FETCH_FAILURES = 3;

// Stripe rejects mutations while a clock is advancing; poll until status is "ready".
export const waitForClockReady = async ({
	stripeCli,
	testClockId,
}: {
	stripeCli: Stripe;
	testClockId: string;
}) => {
	const deadline = Date.now() + CLOCK_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const clock = await stripeCli.testHelpers.testClocks.retrieve(testClockId);
		if (clock.status === "ready") {
			return;
		}
		await timeout(CLOCK_READY_POLL_MS);
	}
	throw new Error(
		`Test clock ${testClockId} not ready after ${CLOCK_READY_TIMEOUT_MS}ms`,
	);
};

type StripeInvoiceSnapshot = {
	id: string;
	status: string | null;
	billingReason: string | null;
};

export type ClockInvoiceBaseline = {
	stripeCustomerIds: string[];
	/** Every invoice that already existed before the advance, by Stripe id. */
	invoices: Map<string, StripeInvoiceSnapshot>;
	/** Null when no Autumn customer could be resolved — Stripe-only signal then. */
	autumn: AutumnInt | null;
	autumnCustomerIds: string[];
};

type AutumnInvoiceRow = { stripe_id?: string | null; status?: string | null };

const listStripeInvoices = async ({
	stripeCli,
	stripeCustomerIds,
}: {
	stripeCli: Stripe;
	stripeCustomerIds: string[];
}): Promise<StripeInvoiceSnapshot[]> => {
	const snapshots: StripeInvoiceSnapshot[] = [];
	for (const customer of stripeCustomerIds) {
		const list = await stripeCli.invoices.list({
			customer,
			limit: STRIPE_INVOICE_LIST_LIMIT,
		});
		for (const invoice of list.data) {
			if (!invoice.id) continue;
			snapshots.push({
				id: invoice.id,
				status: invoice.status ?? null,
				billingReason: invoice.billing_reason ?? null,
			});
		}
	}
	return snapshots;
};

/**
 * Snapshot of what exists BEFORE the advance, so "new invoice" is unambiguous.
 * Returns null if the clock's customers can't be resolved — callers then fall
 * back to their legacy fixed wait rather than asserting on nothing.
 */
export const captureClockInvoiceBaseline = async ({
	stripeCli,
	testClockId,
	autumn,
	customerId,
}: {
	stripeCli: Stripe;
	testClockId: string;
	autumn?: AutumnInt;
	customerId?: string;
}): Promise<ClockInvoiceBaseline | null> => {
	try {
		const stripeCustomers = await stripeCli.customers.list({
			test_clock: testClockId,
			limit: STRIPE_CLOCK_CUSTOMER_LIMIT,
		});
		const stripeCustomerIds = stripeCustomers.data.map((c) => c.id);
		if (stripeCustomerIds.length === 0) return null;

		// Autumn writes its own customer id onto the Stripe customer, so call sites
		// that have no Autumn client still get the Autumn-side signal.
		const autumnCustomerIds = customerId
			? [customerId]
			: stripeCustomers.data
					.map((c) => c.metadata?.autumn_id)
					.filter((id): id is string => Boolean(id));

		const invoices = await listStripeInvoices({ stripeCli, stripeCustomerIds });

		return {
			stripeCustomerIds,
			invoices: new Map(invoices.map((invoice) => [invoice.id, invoice])),
			autumn: autumnCustomerIds.length > 0 ? (autumn ?? new AutumnInt()) : null,
			autumnCustomerIds,
		};
	} catch (error) {
		console.log(
			"   - [clock settle] could not snapshot invoices, falling back to fixed wait:",
			error,
		);
		return null;
	}
};

/** Null means the Autumn signal is unavailable (server error, wrong org key) —
 * treated as "don't block on it" rather than as a failure. */
const fetchAutumnInvoices = async ({
	baseline,
}: {
	baseline: ClockInvoiceBaseline;
}): Promise<AutumnInvoiceRow[] | null> => {
	const client = baseline.autumn;
	if (!client) return null;
	try {
		const customers = await Promise.all(
			baseline.autumnCustomerIds.map((id) =>
				client.customers.get<{ invoices?: AutumnInvoiceRow[] }>(id, {
					skip_cache: "true",
				}),
			),
		);
		return customers.flatMap((customer) => customer.invoices ?? []);
	} catch {
		return null;
	}
};

const newInvoicesSince = ({
	baseline,
	snapshots,
}: {
	baseline: ClockInvoiceBaseline;
	snapshots: StripeInvoiceSnapshot[];
}) => snapshots.filter((invoice) => !baseline.invoices.has(invoice.id));

/** Stripe generates the invoice during the advance, so this normally returns on
 * the first look; the grace window only covers the occasional lag. */
const waitForNewStripeInvoices = async ({
	stripeCli,
	baseline,
	deadline,
}: {
	stripeCli: Stripe;
	baseline: ClockInvoiceBaseline;
	deadline: number;
}): Promise<StripeInvoiceSnapshot[]> => {
	const graceDeadline = Math.min(deadline, Date.now() + noInvoiceGraceMs());
	while (true) {
		const snapshots = await listStripeInvoices({
			stripeCli,
			stripeCustomerIds: baseline.stripeCustomerIds,
		});
		const newOnes = newInvoicesSince({ baseline, snapshots });
		if (newOnes.length > 0) return newOnes;
		if (Date.now() >= graceDeadline) return [];
		await timeout(STRIPE_POLL_INTERVAL_MS);
	}
};

const waitForStripeStatus = async ({
	stripeCli,
	baseline,
	invoiceIds,
	deadline,
}: {
	stripeCli: Stripe;
	baseline: ClockInvoiceBaseline;
	invoiceIds: Set<string>;
	deadline: number;
}): Promise<StripeInvoiceSnapshot[]> => {
	let tracked: StripeInvoiceSnapshot[] = [];
	while (true) {
		const snapshots = await listStripeInvoices({
			stripeCli,
			stripeCustomerIds: baseline.stripeCustomerIds,
		});
		tracked = snapshots.filter((invoice) => invoiceIds.has(invoice.id));
		const allFinalized =
			tracked.length === invoiceIds.size &&
			tracked.every((invoice) => invoice.status !== "draft");
		if (allFinalized || Date.now() >= deadline) return tracked;
		await timeout(STRIPE_POLL_INTERVAL_MS);
	}
};

const waitForAutumnInvoices = async ({
	baseline,
	invoiceIds,
	requireFinalized,
	deadline,
}: {
	baseline: ClockInvoiceBaseline;
	invoiceIds: Set<string>;
	requireFinalized: boolean;
	deadline: number;
}): Promise<void> => {
	if (!baseline.autumn || invoiceIds.size === 0) return;
	let consecutiveFailures = 0;
	while (true) {
		const rows = await fetchAutumnInvoices({ baseline });
		if (rows === null) {
			// A one-off 429/hiccup is not a reason to drop the signal; a customer
			// this client genuinely cannot read is.
			consecutiveFailures += 1;
			if (consecutiveFailures >= MAX_AUTUMN_FETCH_FAILURES) return;
			if (Date.now() >= deadline) return;
			await timeout(AUTUMN_POLL_INTERVAL_MS);
			continue;
		}
		consecutiveFailures = 0;

		const matched = rows.filter(
			(row) => row.stripe_id && invoiceIds.has(row.stripe_id),
		);
		const settled =
			matched.length >= invoiceIds.size &&
			(!requireFinalized || matched.every((row) => row.status !== "draft"));
		if (settled || Date.now() >= deadline) return;
		await timeout(AUTUMN_POLL_INTERVAL_MS);
	}
};

export type ClockSettleMode =
	/** Boundary that should produce a new, already-finalized period invoice —
	 * a single-shot advance past `hoursToFinalizeInvoice`. */
	| "invoice-finalized"
	/** First leg of a `withPause` advance: land exactly on the boundary, where
	 * the period invoice is created as a DRAFT and stays that way. */
	| "invoice-created"
	/** Second leg of a `withPause` advance: the invoice already exists as a
	 * draft and this advance only pushes past `hoursToFinalizeInvoice`. */
	| "finalize-pending";

/**
 * Waits for the consequences of a clock advance to be observable, then returns.
 * Never throws on timeout — the ceiling only bounds a genuine failure.
 */
export const waitForClockInvoiceSettle = async ({
	stripeCli,
	baseline,
	mode = "invoice-finalized",
	timeoutMs = invoiceSettleTimeoutMs(),
	legacyWaitMs,
}: {
	stripeCli: Stripe;
	baseline: ClockInvoiceBaseline;
	mode?: ClockSettleMode;
	timeoutMs?: number;
	/**
	 * Set when polling is REPLACING an explicit blind wait the call site asked
	 * for. If this boundary turns out to produce no invoice there is nothing to
	 * poll for, so the original wait is honoured in full; when it does produce
	 * one, the wait collapses to `legacyWaitFloorMs`.
	 */
	legacyWaitMs?: number;
}): Promise<void> => {
	const startedAt = Date.now();
	const deadline = startedAt + timeoutMs;
	const settleFloor = async ({ noSignal }: { noSignal: boolean }) => {
		const floorMs =
			legacyWaitMs === undefined
				? postSettleFloorMs()
				: noSignal
					? legacyWaitMs
					: Math.min(legacyWaitMs, legacyWaitFloorMs());
		const remainingMs = floorMs - (Date.now() - startedAt);
		if (remainingMs > 0) await timeout(remainingMs);
	};

	if (mode === "finalize-pending") {
		// The invoice this advance finalizes was created by the previous leg, so
		// it is IN the baseline — track the drafts instead of looking for new ids.
		const pendingDraftIds = new Set(
			[...baseline.invoices.values()]
				.filter(
					(invoice) =>
						invoice.status === "draft" &&
						invoice.billingReason === CYCLE_BILLING_REASON,
				)
				.map((invoice) => invoice.id),
		);

		if (pendingDraftIds.size > 0) {
			await waitForStripeStatus({
				stripeCli,
				baseline,
				invoiceIds: pendingDraftIds,
				deadline: Math.min(deadline, Date.now() + STRIPE_FINALIZE_TIMEOUT_MS),
			});
			await waitForAutumnInvoices({
				baseline,
				invoiceIds: pendingDraftIds,
				requireFinalized: true,
				deadline,
			});
		}

		await settleFloor({ noSignal: pendingDraftIds.size === 0 });
		return;
	}

	const newInvoices = await waitForNewStripeInvoices({
		stripeCli,
		baseline,
		deadline,
	});

	if (newInvoices.length === 0) {
		// No invoice at this boundary (cancelled sub, free product, nothing due).
		await settleFloor({ noSignal: true });
		return;
	}

	const cycleInvoiceIds = new Set(
		newInvoices
			.filter((invoice) => invoice.billingReason === CYCLE_BILLING_REASON)
			.map((invoice) => invoice.id),
	);
	const trackedIds =
		cycleInvoiceIds.size > 0
			? cycleInvoiceIds
			: new Set(newInvoices.map((invoice) => invoice.id));
	// Autumn may legitimately never store a non-cycle invoice, so bound that wait.
	const trackedDeadline =
		cycleInvoiceIds.size > 0
			? deadline
			: Math.min(deadline, Date.now() + NON_CYCLE_SIGNAL_TIMEOUT_MS);

	// On the first leg of a withPause advance the invoice is MEANT to stay draft
	// until the second leg, so only wait on finalization when one is expected.
	if (mode === "invoice-finalized") {
		await waitForStripeStatus({
			stripeCli,
			baseline,
			invoiceIds: trackedIds,
			deadline: Math.min(
				trackedDeadline,
				Date.now() + STRIPE_FINALIZE_TIMEOUT_MS,
			),
		});
	}
	await waitForAutumnInvoices({
		baseline,
		invoiceIds: trackedIds,
		// Presence alone already means invoice.created ran to completion (the row
		// is upserted AFTER the balance resets). When Stripe has finalized too,
		// hold out for Autumn's finalized/paid status — that is the state tests
		// assert on invoice totals, and it costs nothing extra on the happy path.
		requireFinalized: mode === "invoice-finalized",
		deadline: trackedDeadline,
	});

	await settleFloor({ noSignal: false });
};
