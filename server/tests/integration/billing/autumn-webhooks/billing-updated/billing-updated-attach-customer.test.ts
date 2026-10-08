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
// A1: NEW PAID PLAN ATTACH
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("billing.updated: A1 new paid plan attach → activated")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// A2: IMMEDIATE UPGRADE PRO → PREMIUM
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("billing.updated: A2 immediate upgrade → activated + expired")}`,
	async () => {
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
	},
);
