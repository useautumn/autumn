/**
 * Integration tests for `billing.updated` webhook via the ATTACH V2 endpoint.
 *
 * Contract under test:
 *   Event type: billing.updated
 *   Payload shape (BillingChangeResponse):
 *     - object: "billing.updated"
 *     - customer_id: string
 *     - entity_id?: string | null
 *     - plan_changes: Array<{
 *         action: "activated" | "scheduled" | "updated" | "expired",
 *         plan: { plan_id, status, started_at, canceled_at, expires_at, ... },
 *         previous_attributes: Record<string, unknown> | null,
 *         item_changes: Array<{ action, feature_id }>,
 *       }>
 *
 * Scenarios:
 *   A1: new customer, paid plan attach → one `activated` for pro
 *   A2: immediate upgrade pro → premium → `activated` for premium + `expired` for pro
 *   A3: scheduled downgrade premium → pro → `updated` for premium + `scheduled` for pro
 *   A4: cancel premium → free → `updated` for premium + `scheduled` for free
 *   E1: new entity attach → entity_id populated, one `activated`
 *   E2: entity upgrade → entity_id populated, `activated` + `expired`
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type {
	BillingChangeResponse,
	CustomerPlanChange,
	PlanChangeAction,
} from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type BillingUpdatedPayload = {
	type: string;
	data: BillingChangeResponse;
};

const findChange = (
	plan_changes: CustomerPlanChange[] | undefined,
	{ action, planId }: { action: PlanChangeAction; planId: string },
): CustomerPlanChange | undefined =>
	plan_changes?.find(
		(change) =>
			change.action === action &&
			(change.subscription?.plan_id ?? change.purchase?.plan_id) === planId,
	);

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["billing.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════════
// A1: NEW PAID PLAN ATTACH
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("billing.updated: A1 new paid plan attach → activated")}`, async () => {
	const customerId = "billing-updated-a1-new";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			findChange(payload.data.plan_changes, {
				action: "activated",
				planId: pro.id,
			}) !== undefined,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);

	const activated = findChange(data.plan_changes, {
		action: "activated",
		planId: pro.id,
	});
	expect(activated).toBeDefined();
	expect(activated?.previous_attributes).toBeNull();
	expect(activated?.subscription?.plan_id).toBe(pro.id);
	expect(activated?.subscription?.status).toBe("active");
});

// ═══════════════════════════════════════════════════════════════════════════════
// A2: IMMEDIATE UPGRADE PRO → PREMIUM
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("billing.updated: A2 immediate upgrade → activated + expired")}`, async () => {
	const customerId = "billing-updated-a2-upgrade";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			findChange(payload.data.plan_changes, {
				action: "activated",
				planId: premium.id,
			}) !== undefined &&
			findChange(payload.data.plan_changes, {
				action: "expired",
				planId: pro.id,
			}) !== undefined,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;

	const activated = findChange(data.plan_changes, {
		action: "activated",
		planId: premium.id,
	});
	expect(activated).toBeDefined();
	expect(activated?.previous_attributes).toBeNull();

	const expired = findChange(data.plan_changes, {
		action: "expired",
		planId: pro.id,
	});
	expect(expired).toBeDefined();
	expect(expired?.previous_attributes).toMatchObject({ status: "active" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A3: SCHEDULED DOWNGRADE PREMIUM → PRO
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("billing.updated: A3 scheduled downgrade → updated + scheduled")}`, async () => {
	const customerId = "billing-updated-a3-downgrade";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			findChange(payload.data.plan_changes, {
				action: "updated",
				planId: premium.id,
			}) !== undefined &&
			findChange(payload.data.plan_changes, {
				action: "scheduled",
				planId: pro.id,
			}) !== undefined,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;

	const updated = findChange(data.plan_changes, {
		action: "updated",
		planId: premium.id,
	});
	expect(updated).toBeDefined();
	expect(updated?.previous_attributes).toMatchObject({
		canceled_at: null,
		expires_at: null,
	});

	const scheduled = findChange(data.plan_changes, {
		action: "scheduled",
		planId: pro.id,
	});
	expect(scheduled).toBeDefined();
	expect(scheduled?.subscription?.status).toBe("scheduled");
});

// ═══════════════════════════════════════════════════════════════════════════════
// A4: CANCEL TO FREE PREMIUM → FREE
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("billing.updated: A4 cancel to free → updated + scheduled")}`, async () => {
	const customerId = "billing-updated-a4-cancel";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [free, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			findChange(payload.data.plan_changes, {
				action: "updated",
				planId: premium.id,
			}) !== undefined &&
			findChange(payload.data.plan_changes, {
				action: "scheduled",
				planId: free.id,
			}) !== undefined,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;

	const updated = findChange(data.plan_changes, {
		action: "updated",
		planId: premium.id,
	});
	expect(updated).toBeDefined();
	expect(updated?.previous_attributes).toMatchObject({
		canceled_at: null,
		expires_at: null,
	});

	const scheduled = findChange(data.plan_changes, {
		action: "scheduled",
		planId: free.id,
	});
	expect(scheduled).toBeDefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// E1: ENTITY-LEVEL NEW ATTACH
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("billing.updated: E1 entity new attach → entity_id + activated")}`, async () => {
	const customerId = "billing-updated-e1-entity-new";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entityId = entities[0].id;

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entityId,
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entityId &&
			findChange(payload.data.plan_changes, {
				action: "activated",
				planId: pro.id,
			}) !== undefined,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.entity_id).toBe(entityId);

	const activated = findChange(data.plan_changes, {
		action: "activated",
		planId: pro.id,
	});
	expect(activated).toBeDefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2: ENTITY-LEVEL UPGRADE
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("billing.updated: E2 entity upgrade → entity_id + activated + expired")}`, async () => {
	const customerId = "billing-updated-e2-entity-upgrade";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entityId,
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entityId &&
			findChange(payload.data.plan_changes, {
				action: "activated",
				planId: premium.id,
			}) !== undefined &&
			findChange(payload.data.plan_changes, {
				action: "expired",
				planId: pro.id,
			}) !== undefined,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.entity_id).toBe(entityId);

	const activated = findChange(data.plan_changes, {
		action: "activated",
		planId: premium.id,
	});
	expect(activated).toBeDefined();

	const expired = findChange(data.plan_changes, {
		action: "expired",
		planId: pro.id,
	});
	expect(expired).toBeDefined();
	expect(expired?.previous_attributes).toMatchObject({ status: "active" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKOUT: ATTACH VIA STRIPE CHECKOUT (no payment method on file)
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("billing.updated: stripe checkout completion → activated")}`, async () => {
	const customerId = "billing-updated-stripe-checkout";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro-checkout", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, skipWebhooks: true }), // no payment method
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach returns a payment_url because there's no PM on file
	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(attachResult.payment_url).toContain("checkout.stripe.com");

	// Complete checkout in Stripe — triggers checkout.session.completed →
	// handleCheckoutSessionMetadataV2 → executeBillingPlan → webhook fires
	await completeStripeCheckoutForm({ url: attachResult.payment_url });

	const result = await waitForWebhook<BillingUpdatedPayload>({
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

	expect(result).not.toBeNull();
	const activated = findChange(result!.payload.data.plan_changes, {
		action: "activated",
		planId: pro.id,
	});
	expect(activated?.subscription?.status).toBe("active");
	expect(activated?.previous_attributes).toBeNull();
});
