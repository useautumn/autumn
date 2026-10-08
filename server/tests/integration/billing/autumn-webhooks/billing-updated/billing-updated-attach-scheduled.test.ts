// `billing.updated` webhook via the attach V2 endpoint: plan_changes report activated / scheduled /
// updated / expired actions per plan.

import { afterAll, beforeAll, expect, test } from "bun:test";
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
import {
	type BillingUpdatedPayload,
	findChange,
} from "./utils/billingUpdatedAttach";

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
// A3: SCHEDULED DOWNGRADE PREMIUM → PRO
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("billing.updated: A3 scheduled downgrade → updated + scheduled")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// A4: CANCEL TO FREE PREMIUM → FREE
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("billing.updated: A4 cancel to free → updated + scheduled")}`,
	async () => {
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
	},
);
