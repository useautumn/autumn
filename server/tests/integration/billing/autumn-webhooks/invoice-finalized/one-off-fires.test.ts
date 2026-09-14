/**
 * A one-off purchase produces a standalone Stripe invoice (no subscription).
 * It must still fire `invoice.finalized` so integrations can settle it.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiListInvoiceV1 } from "@autumn/shared";
import { WebhookEventType } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type InvoiceFinalizedPayload = { type: string; data: ApiListInvoiceV1 };

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: [WebhookEventType.InvoiceFinalized],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

test.concurrent(
	`${chalk.yellowBright("invoice.finalized webhook: one-off (subscriptionless) invoice fires")}`,
	async () => {
		const customerId = "inv-finalized-oneoff";
		const oneOff = products.base({
			id: "oneoff-wh",
			items: [items.oneOffPrice({ price: 50 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOff] }),
			],
			actions: [s.billing.attach({ productId: oneOff.id })],
		});

		const customer = await autumnV1.customers.get(customerId);
		const stripeId = customer.invoices![0].stripe_id;

		const delivered = await waitForWebhook<InvoiceFinalizedPayload>({
			token: webhook.playToken,
			predicate: (payload) =>
				payload.type === WebhookEventType.InvoiceFinalized &&
				payload.data?.stripe_id === stripeId,
			timeoutMs: 30_000,
		});

		expect(delivered).not.toBeNull();
		expect(delivered!.payload.data.total).toBe(50);
		expect(delivered!.payload.data.items!.length).toBe(1);
		expect(delivered!.payload.data.items![0].plan_id).toBe(oneOff.id);
	},
);
