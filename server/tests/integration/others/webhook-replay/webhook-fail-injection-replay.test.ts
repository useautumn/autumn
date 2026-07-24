/**
 * End-to-end test for Stripe webhook failure injection + redelivery recovery.
 *
 * Contract under test:
 *   - billing.attach (latest version) metadata `test_webhook_fail` rides onto
 *     the Stripe checkout session, so checkout.session.completed carries it.
 *     NOTE: must use the latest client — AttachParamsV0Schema (V1 client)
 *     silently strips `metadata`.
 *   - While the marker is present on the LIVE Stripe object, EVERY delivery
 *     of the event fails (sync-ack 500, no false ack): the customer has PAID
 *     but the product stays unactivated — the outage failure mode, held open
 *     deterministically.
 *   - Removing the metadata from the live object ends the "outage": the next
 *     redelivery (triggered via Stripe's event retry endpoint — what `stripe
 *     events resend` uses; no Autumn worker code) activates the product
 *     exactly once.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";

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

const CHECKOUT_SESSION_ID_REGEX = /cs_(?:test|live)_[A-Za-z0-9]+/;

// All initial deliveries (incl. dev duplicates) land well within this window.
const FAILED_DELIVERY_SETTLE_MS = 8_000;

test.concurrent(
	`${chalk.yellowBright("webhook-replay: deliveries fail while marker present, redelivery after removal activates once")}`,
	async () => {
		const customerId = "webhook-fail-injection-replay";

		const pro = products.pro({
			id: "pro-webhook-replay",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }), // No payment method → stripe checkout
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// ── 1. Attach with the failure-injection test option ──────────
		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: pro.id,
			metadata: { test_webhook_fail: "true" },
		});

		expect(result.payment_url).toBeDefined();
		const sessionId = result.payment_url?.match(CHECKOUT_SESSION_ID_REGEX)?.[0];
		if (!sessionId) {
			throw new Error(`No session id in payment_url: ${result.payment_url}`);
		}

		// ── 2. Pay for real via Stripe checkout ───────────────────────
		await completeStripeCheckoutFormV2({ url: result.payment_url });

		// ── 3. The completed event exists on Stripe and carries the marker ──
		const stripeEvent = await waitFor<Stripe.Event>({
			description: "checkout.session.completed event on Stripe",
			fetch: async () => {
				const events = await ctx.stripeCli.events.list({
					type: "checkout.session.completed",
					limit: 100,
				});
				return events.data.find(
					(event) =>
						(event.data.object as Stripe.Checkout.Session).id === sessionId,
				);
			},
		});
		const session = stripeEvent.data.object as Stripe.Checkout.Session;
		expect(session.metadata?.test_webhook_fail).toBe("true");

		// ── 4. Outage held open: every delivery fails while the marker is on
		// the live session. Paid, but NOT provisioned. ──────────────────
		await timeout(FAILED_DELIVERY_SETTLE_MS);

		const customerDuringOutage =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const productDuringOutage = customerDuringOutage.products?.find(
			(product) => product.id === pro.id,
		);
		expect(productDuringOutage).toBeUndefined();

		// ── 5. End the outage: remove the marker from the live objects ──
		// (Empty string deletes a metadata key in Stripe.)
		await ctx.stripeCli.checkout.sessions.update(sessionId, {
			metadata: { test_webhook_fail: "" },
		});
		if (typeof session.subscription === "string") {
			await ctx.stripeCli.subscriptions.update(session.subscription, {
				metadata: { test_webhook_fail: "" },
			});
		}

		// ── 6. Ask STRIPE to redeliver the same event (no Autumn worker) ──
		await ctx.stripeCli.rawRequest(
			"POST",
			`/v1/events/${stripeEvent.id}/retry`,
			{},
		);

		// ── 7. Recovered: product active, exactly once ────────────────
		const customerAfterRetry = await waitFor<ApiCustomerV3>({
			description: "product activation after redelivery",
			fetch: async () => {
				const customer =
					await autumnV1.customers.get<ApiCustomerV3>(customerId);
				const active = customer.products?.find(
					(product) => product.id === pro.id,
				);
				return active ? customer : undefined;
			},
		});

		await expectProductActive({
			customer: customerAfterRetry,
			productId: pro.id,
		});
		await expectCustomerInvoiceCorrect({
			customer: customerAfterRetry,
			count: 1,
			latestTotal: 20,
			latestInvoiceProductId: pro.id,
		});

		const activations = customerAfterRetry.products?.filter(
			(product) => product.id === pro.id,
		);
		expect(activations?.length).toBe(1);
	},
);
