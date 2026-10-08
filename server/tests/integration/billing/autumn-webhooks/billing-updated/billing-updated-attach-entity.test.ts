// `billing.updated` webhook via the attach V2 endpoint: plan_changes report activated / scheduled /
// updated / expired actions per plan.

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
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
// E1: ENTITY-LEVEL NEW ATTACH
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("billing.updated: E1 entity new attach → entity_id + activated")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// E2: ENTITY-LEVEL UPGRADE
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("billing.updated: E2 entity upgrade → entity_id + activated + expired")}`,
	async () => {
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
	},
);
