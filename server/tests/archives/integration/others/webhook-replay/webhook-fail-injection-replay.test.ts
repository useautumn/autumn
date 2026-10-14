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
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

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

		await completeStripeCheckoutFormV2({ url: result.payment_url });

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

		await timeout(FAILED_DELIVERY_SETTLE_MS);

		const customerDuringOutage =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const productDuringOutage = customerDuringOutage.products?.find(
			(product) => product.id === pro.id,
		);
		expect(productDuringOutage).toBeUndefined();

		await ctx.stripeCli.checkout.sessions.update(sessionId, {
			metadata: { test_webhook_fail: "" },
		});
		if (typeof session.subscription === "string") {
			await ctx.stripeCli.subscriptions.update(session.subscription, {
				metadata: { test_webhook_fail: "" },
			});
		}

		await ctx.stripeCli.rawRequest(
			"POST",
			`/v1/events/${stripeEvent.id}/retry`,
			{},
		);

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
