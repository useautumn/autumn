/**
 * Integration tests for `billing.updated` webhooks emitted from Stripe's
 * `customer.subscription.updated` flow — `handleStripeSubscriptionUpdated`.
 *
 * Scenarios covered:
 *   - Trial end: status flips out of trialing → tags `trial_ended`
 *   - Schedule phase change: scheduled phase activates → tags `phase_changed`
 *   - Past due: failed payment at renewal → updated change with `past_due`
 *     flipped in `previous_attributes` (no tag — structural signal)
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
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type BillingUpdatedPayload = {
	type: string;
	data: BillingChangeResponse & { tags?: string[] };
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
// TRIAL ENDED
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("billing.updated: trial end → tags includes trial_ended")}`, async () => {
	const customerId = "billing-updated-trial-end";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		id: "pro",
		items: [messagesItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 16 }), // past 14-day trial
		],
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			(payload.data?.tags ?? []).includes("trial_ended"),
		timeoutMs: 30000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.tags).toContain("trial_ended");
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE PHASE CHANGED
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("billing.updated: schedule phase change → tags includes phase_changed")}`, async () => {
	const customerId = "billing-updated-phase-change";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			// Schedule downgrade: pro takes over at premium's period end.
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ toNextInvoice: true }),
		],
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			(payload.data?.tags ?? []).includes("phase_changed"),
		timeoutMs: 30000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.tags).toContain("phase_changed");

	// Old premium expires; pro (was scheduled) is now activated.
	const expired = findChange(data.plan_changes, {
		action: "expired",
		planId: premium.id,
	});
	const activated = findChange(data.plan_changes, {
		action: "activated",
		planId: pro.id,
	});
	expect(expired || activated).toBeDefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAST DUE
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("billing.updated: customer enters past_due → updated with past_due flip")}`, async () => {
	const customerId = "billing-updated-past-due";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceTestClock({ toNextInvoice: true }),
		],
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			findChange(payload.data?.plan_changes, {
				action: "updated",
				planId: pro.id,
			})?.subscription?.past_due === true,
		timeoutMs: 30000,
	});

	expect(result).not.toBeNull();
	const updated = findChange(result!.payload.data.plan_changes, {
		action: "updated",
		planId: pro.id,
	});
	expect(updated?.subscription?.past_due).toBe(true);
	expect(updated?.previous_attributes).toMatchObject({ past_due: false });
});
