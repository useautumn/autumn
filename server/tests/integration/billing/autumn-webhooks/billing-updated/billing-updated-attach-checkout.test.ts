// `billing.updated` webhook via the attach V2 endpoint: plan_changes report activated / scheduled /
// updated / expired actions per plan.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { AttachParamsV0Input, AttachParamsV1Input } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { completeInvoiceConfirmationV2 as completeInvoiceConfirmation } from "@tests/utils/browserPool/completeInvoiceConfirmationV2";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	type BillingUpdatedPayload,
	findChange,
} from "./utils/billingUpdatedAttach";

type CustomerProductsUpdatedPayload = {
	type: string;
	data: {
		scenario: string;
		customer: { id: string };
		updated_product: { id: string };
	};
};

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["billing.updated", "customer.products.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKOUT: ATTACH VIA STRIPE CHECKOUT (no payment method on file)
// ═══════════════════════════════════════════════════════════════════════════════

// Red: promotion reinserts the pending custom price and crashes before webhooks.
// Green: checkout emits both events with the activated custom-price plan.
test(`${chalk.yellowBright("billing.updated: custom-price checkout completion → activated")}`, async () => {
	const customerId = "billing-updated-stripe-checkout";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro-checkout", items: [messagesItem] });

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, skipWebhooks: true }), // no payment method
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach returns a payment_url because there's no PM on file
	const attachResult = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		customize: { price: itemsV2.monthlyPrice({ amount: 42 }) },
	});
	expect(attachResult.payment_url).toContain("checkout.stripe.com");

	// Complete checkout in Stripe — triggers checkout.session.completed →
	// handleCheckoutSessionMetadataV2 → executeBillingPlan → webhook fires
	await completeStripeCheckoutForm({ url: attachResult.payment_url });

	const [productsResult, result] = await Promise.all([
		waitForWebhook<CustomerProductsUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "customer.products.updated" &&
				payload.data?.customer?.id === customerId &&
				payload.data?.updated_product?.id === pro.id &&
				payload.data?.scenario === "new",
			timeoutMs: 30000,
		}),
		waitForWebhook<BillingUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "billing.updated" &&
				payload.data?.customer_id === customerId &&
				findChange(payload.data.plan_changes, {
					action: "activated",
					planId: pro.id,
				}) !== undefined,
			timeoutMs: 30000,
		}),
	]);

	expect(productsResult).not.toBeNull();
	expect(result).not.toBeNull();
	const activated = findChange(result!.payload.data.plan_changes, {
		action: "activated",
		planId: pro.id,
	});
	expect(activated?.subscription?.status).toBe("active");
	expect(activated?.previous_attributes).toBeNull();
});

test(`${chalk.yellowBright("enable_plan_immediately: checkout completion → products active + billing updated")}`, async () => {
	const customerId = "billing-updated-stripe-checkout-immediate";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-checkout-immediate",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const attachParams: AttachParamsV0Input = {
		customer_id: customerId,
		product_id: pro.id,
		enable_product_immediately: true,
	};
	const attachResult =
		await autumnV1.billing.attach<AttachParamsV0Input>(attachParams);
	expect(attachResult.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: attachResult.payment_url });

	const [productsResult, billingResult] = await Promise.all([
		waitForWebhook<CustomerProductsUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "customer.products.updated" &&
				payload.data?.customer?.id === customerId &&
				payload.data?.updated_product?.id === pro.id &&
				payload.data?.scenario === "active",
			timeoutMs: 30000,
		}),
		waitForWebhook<BillingUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "billing.updated" &&
				payload.data?.customer_id === customerId &&
				findChange(payload.data.plan_changes, {
					action: "updated",
					planId: pro.id,
				}) !== undefined,
			timeoutMs: 30000,
		}),
	]);

	expect(productsResult).not.toBeNull();
	expect(billingResult).not.toBeNull();
	expect(
		findChange(billingResult!.payload.data.plan_changes, {
			action: "updated",
			planId: pro.id,
		})?.subscription?.status,
	).toBe("active");
});

test.concurrent(
	`${chalk.yellowBright("billing.updated: 3DS completion → activated")}`,
	async () => {
		const customerId = "billing-updated-3ds";
		const pro = products.pro({
			id: "pro-3ds",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "authenticate", skipWebhooks: true }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const result = await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: pro.id,
		});
		expect(result.required_action?.code).toBe("3ds_required");

		await completeInvoiceConfirmation({ url: result.payment_url! });

		const webhookResult = await waitForWebhook<BillingUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "billing.updated" &&
				payload.data?.customer_id === customerId &&
				findChange(payload.data.plan_changes, {
					action: "activated",
					planId: pro.id,
				}) !== undefined,
			timeoutMs: 30000,
		});

		expect(webhookResult).not.toBeNull();
	},
);
