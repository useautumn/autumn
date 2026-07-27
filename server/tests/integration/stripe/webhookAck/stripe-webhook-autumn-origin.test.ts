/**
 * TDD test for phase 2: Autumn-originated Stripe writes carry an
 * "autumn:"-prefixed idempotency key, observable on the resulting Stripe
 * events via event.request.idempotency_key. This is what lets the webhook
 * ack classifier recognize "we caused this" with no per-type heuristics.
 *
 * Contract under test:
 *   New behaviors:
 *     - v2 billing.attach creates the Stripe subscription through
 *       executeStripeSubscriptionOperation with an idempotencyKey of the form
 *       autumn:<source>:<uuid>.
 *   Side effects (observable via the Stripe Events API):
 *     - customer.subscription.created events produced by attach have
 *       event.request.idempotency_key starting with "autumn:".
 *
 * Pre-impl red: no billing write passes an idempotency key, so
 * event.request.idempotency_key is a Stripe-generated value (no prefix).
 * Post-impl green: subscription events from attach carry the autumn prefix.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";

test.concurrent(
	`${chalk.yellowBright("webhookAck: attach-created subscription events carry autumn idempotency key")}`,
	async () => {
		const customerId = "webhook-ack-autumn-origin";
		const testStartSeconds = Math.floor(Date.now() / 1000) - 5;
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// ── Contract assertion: sub.created events from this attach are
		// stamped with an autumn:-prefixed request idempotency key ─────
		const events = await ctx.stripeCli.events.list({
			type: "customer.subscription.created",
			created: { gte: testStartSeconds },
			limit: 50,
		});

		const attachSubEvents = events.data.filter((event) => {
			const subscription = event.data.object as Stripe.Subscription;
			return Boolean(subscription.metadata?.autumn_managed_at);
		});

		expect(attachSubEvents.length).toBeGreaterThan(0);

		for (const event of attachSubEvents) {
			const idempotencyKey = event.request?.idempotency_key ?? "";
			expect(idempotencyKey.startsWith("autumn:")).toBe(true);
		}
	},
);
