/**
 * `invoice.finalized` webhook: fires once per finalized Stripe invoice, after
 * line items are reconciled, with a body equal to the invoices.list row.
 *
 * Contract:
 *   type: "invoice.finalized"
 *   data: ApiListInvoiceV1 (with items[], entities[])
 *   exactly one delivery per stripe invoice (created never fires; retries dedupe)
 *
 * Red (current):  no webhook exists.
 * Green (after):  one delivery per invoice, body toEqual the list row.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiListInvoiceV1 } from "@autumn/shared";
import { WebhookEventType } from "@autumn/shared";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import {
	getPlayHistory,
	getTestSvixAppId,
	parseEventBody,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type InvoiceFinalizedPayload = {
	type: string;
	data: ApiListInvoiceV1;
};

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

const countDeliveries = async ({ stripeId }: { stripeId: string }) => {
	const history = await getPlayHistory({ token: webhook.playToken });
	return history.data.filter((event) => {
		try {
			const payload = parseEventBody<InvoiceFinalizedPayload>(event);
			return (
				payload.type === WebhookEventType.InvoiceFinalized &&
				payload.data?.stripe_id === stripeId
			);
		} catch {
			return false;
		}
	}).length;
};

test.concurrent(
	`${chalk.yellowBright("invoice.finalized webhook: renewal fires once with body == invoices.list row")}`,
	async () => {
		const customerId = "inv-finalized-wh";

		const consumableWords = items.consumableWords({ includedUsage: 50 });
		const pro = products.pro({
			id: "pro-finalized-wh",
			items: [consumableWords],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Words,
					value: 250,
					entityIndex: 0,
					timeout: 5000,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const renewalStripeId = customer.invoices![0].stripe_id;
		await waitForInvoiceLineItems({ stripeInvoiceId: renewalStripeId });

		const delivered = await waitForWebhook<InvoiceFinalizedPayload>({
			token: webhook.playToken,
			predicate: (payload) =>
				payload.type === WebhookEventType.InvoiceFinalized &&
				payload.data?.stripe_id === renewalStripeId,
			timeoutMs: 30_000,
		});

		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as { list: ApiListInvoiceV1[] };
		const listRow = list.find((inv) => inv.stripe_id === renewalStripeId)!;

		expect(delivered).not.toBeNull();
		const body = delivered!.payload.data;
		expect(body).toEqual(listRow);
		expect(body.items!.length).toBeGreaterThan(0);
		expect(body.items!.some((i) => i.entities.length > 0)).toBe(true);

		// Exactly one delivery: invoice.created must not fire, and the finalized reconcile runs once
		expect(await countDeliveries({ stripeId: renewalStripeId })).toBe(1);
	},
);
