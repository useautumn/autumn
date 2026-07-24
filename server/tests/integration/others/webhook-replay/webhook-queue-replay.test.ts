/**
 * End-to-end test for the Stripe webhook SQS replay path.
 *
 * Uses an EARLY-ACKED event (invoice.updated) on purpose: the failed
 * delivery was acked 200, so Stripe never redelivers — the queued replay job
 * is provably the ONLY recovery path (unlike sync-acked events, where
 * Stripe-side redelivery would race the queue).
 *
 * Contract under test:
 *   - Invoice-mode attach leaves an open Autumn invoice mirroring Stripe.
 *   - The invoice is voided externally in Stripe while carrying the
 *     `test_webhook_fail` marker: the invoice.updated webhook fails in the
 *     background after its early 200, so Autumn's invoice stays "open" —
 *     deterministic drift, held open until replayed.
 *   - A JobName.StripeWebhookReplay job — the same payload the server
 *     enqueues on early-ack failure — is consumed by the REAL worker process
 *     off SQS (primary dev queue; processMessage dispatches the job
 *     regardless of queue) and syncs the invoice to "void".
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { JobName } from "@/queue/JobName";
import { addTaskToQueue } from "@/queue/queueUtils";

const POLL_INTERVAL_MS = 500;
// Generous: Stripe's events API is eventually consistent and can lag.
const POLL_TIMEOUT_MS = 60_000;

const waitFor = async <T>({
	fetch,
	description,
}: {
	fetch: () => Promise<T | undefined>;
	description: string;
}): Promise<T> => {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	while (true) {
		const result = await fetch();
		if (result !== undefined) return result;
		if (Date.now() > deadline) {
			throw new Error(`Timed out waiting for: ${description}`);
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
};

// Early-acked failures return 200 — all deliveries settle well within this.
const FAILED_DELIVERY_SETTLE_MS = 8_000;

test.concurrent(
	`${chalk.yellowBright("webhook-replay: queued replay job recovers a failed early-acked invoice.updated")}`,
	async () => {
		const customerId = "webhook-queue-replay";

		const pro = products.pro({
			id: "pro-webhook-queue-replay",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
			],
		});

		// ── 1. Invoice-mode attach → active product + open invoice ────
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const openInvoice = customerAfterAttach.invoices?.[0];
		if (!openInvoice?.stripe_id) {
			throw new Error("Expected an invoice with stripe_id after attach");
		}
		expect(openInvoice.status).toBe("open");

		// ── 2. Arm the injection, then void the invoice in Stripe. The
		// resulting invoice.updated is early-acked (200) and its background
		// processing fails — Stripe will never redeliver. The outage SWITCH
		// lives on the customer's metadata (marker value "customer"), so
		// flipping it later emits no self-healing invoice events. ──────
		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			openInvoice.stripe_id,
		);
		const stripeCustomerId =
			typeof stripeInvoice.customer === "string"
				? stripeInvoice.customer
				: stripeInvoice.customer?.id;
		if (!stripeCustomerId) {
			throw new Error("Expected a stripe customer id on the invoice");
		}

		await ctx.stripeCli.customers.update(stripeCustomerId, {
			metadata: { test_webhook_fail: "true" },
		});
		await ctx.stripeCli.invoices.update(openInvoice.stripe_id, {
			metadata: { test_webhook_fail: "customer" },
		});
		await ctx.stripeCli.invoices.voidInvoice(openInvoice.stripe_id);

		// ── 3. Deterministic drift: Stripe says void, Autumn still open ──
		await timeout(FAILED_DELIVERY_SETTLE_MS);

		const customerDuringOutage =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerDuringOutage.invoices?.[0]?.status).toBe("open");

		// ── 4. End the outage via the customer switch (emits only a benign
		// customer.updated — no invoice event that could heal the drift),
		// then grab the failed event from Stripe ──────────────────────
		await ctx.stripeCli.customers.update(stripeCustomerId, {
			metadata: { test_webhook_fail: "" },
		});

		const voidEvent = await waitFor<Stripe.Event>({
			description: "invoice.updated (void) event on Stripe",
			fetch: async () => {
				const events = await ctx.stripeCli.events.list({
					type: "invoice.updated",
					limit: 100,
				});
				return events.data.find((event) => {
					const invoice = event.data.object as Stripe.Invoice;
					return (
						invoice.id === openInvoice.stripe_id && invoice.status === "void"
					);
				});
			},
		});

		// ── 5. Recover via the QUEUE: same job the server enqueues on
		// early-ack failure; the dev worker process consumes it. ──────
		await addTaskToQueue({
			jobName: JobName.StripeWebhookReplay,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				stripeEvent: voidEvent,
				failedAt: Date.now(),
				failureReason: "simulated outage (webhook-queue-replay test)",
			},
		});

		// ── 6. Worker replay synced the invoice to void ───────────────
		await waitFor({
			description: "Autumn invoice syncing to void via worker replay job",
			fetch: async () => {
				const customer =
					await autumnV1.customers.get<ApiCustomerV3>(customerId);
				const invoice = customer.invoices?.find(
					(row) => row.stripe_id === openInvoice.stripe_id,
				);
				return invoice?.status === "void" ? true : undefined;
			},
		});

		// Product untouched — the replay only synced invoice state.
		const customerAfterReplay =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterReplay,
			productId: pro.id,
		});
		expect(customerAfterReplay.invoices?.length).toBe(1);
	},
);
