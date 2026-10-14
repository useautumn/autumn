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
