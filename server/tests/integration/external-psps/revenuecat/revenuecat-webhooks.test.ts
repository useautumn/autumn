/**
 * RevenueCat Webhook Integration Tests
 *
 * Tests that RevenueCat webhook events trigger the correct Autumn
 * customer.products.updated webhooks via Svix Play.
 *
 * Each test sends a RevenueCat webhook event and verifies that the
 * corresponding outgoing webhook contains the correct scenario:
 * - Initial purchase → new
 * - Renewal → renew
 * - Upgrade (monthly → yearly) → upgrade
 * - Downgrade (yearly → monthly) → downgrade
 * - Cancellation → cancel
 * - Uncancellation → renew
 * - Billing issue → past_due
 * - Expiration → expire
 * - Non-renewing purchase → new
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiProduct } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import {
	getPlayHistory,
	getTestSvixAppId,
	parseEventBody,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import { RevenueCatWebhookClient } from "./utils/revenue-cat-webhook-client";

// ─── Types ───────────────────────────────────────────────────────────────────

type RevenueCatScenario =
	| "new"
	| "renew"
	| "upgrade"
	| "downgrade"
	| "cancel"
	| "uncancel"
	| "past_due"
	| "expired";

type CustomerProductsUpdatedPayload = {
	type: string;
	data: {
		scenario: RevenueCatScenario;
		customer: ApiCustomerV3;
		updated_product: ApiProduct;
		entity?: any;
	};
};

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_12345";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret !==
		RC_WEBHOOK_SECRET
	) {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				processor_configs: {
					...ctx.org.processor_configs,
					revenuecat: {
						api_key: encryptData("mock_rc_api_key_live"),
						sandbox_api_key: encryptData("mock_rc_api_key_sandbox"),
						project_id: "mock_project_live",
						sandbox_project_id: "mock_project_sandbox",
						webhook_secret: RC_WEBHOOK_SECRET,
						sandbox_webhook_secret: RC_WEBHOOK_SECRET,
					},
				},
			},
		});
	}
};

// ─── Svix Play Setup ─────────────────────────────────────────────────────────

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	await setupRevenueCatOrg();

	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["customer.products.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Initial Purchase → scenario: new
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("rc-webhook: initial purchase → scenario: new")}`, async () => {
	const customerId = "rc-webhook-initial-purchase";
	const RC_PRO_MONTHLY_ID = "com.app.rcwh1_pro_monthly";

	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [proMonthly] }),
		],
		actions: [],
	});

	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: proMonthly.id,
			revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
		},
	});

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh1_tx_001",
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "new",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.scenario).toBe("new");
	expect(data.updated_product.id).toBe(proMonthly.id);
	expect(data.customer.id).toBe(customerId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Renewal → scenario: renew
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("rc-webhook: renewal → scenario: renew")}`, async () => {
	const customerId = "rc-webhook-renewal";
	const RC_PRO_MONTHLY_ID = "com.app.rcwh2_pro_monthly";

	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [proMonthly] }),
		],
		actions: [],
	});

	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: proMonthly.id,
			revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
		},
	});

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	// First: initial purchase to create the subscription
	await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh2_tx_001",
	});

	// Wait for the initial purchase webhook to arrive before triggering renewal
	await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "new",
		timeoutMs: 15000,
	});

	// Then: renewal
	await rcClient.renewal({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh2_tx_001",
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "renew",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.scenario).toBe("renew");
	expect(data.updated_product.id).toBe(proMonthly.id);
	expect(data.customer.id).toBe(customerId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade → scenario: upgrade
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("rc-webhook: upgrade (monthly → yearly) → scenario: upgrade")}`, async () => {
	const customerId = "rc-webhook-upgrade";
	const RC_PRO_MONTHLY_ID = "com.app.rcwh3_pro_monthly";
	const RC_PRO_YEARLY_ID = "com.app.rcwh3_pro_yearly";

	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});
	const proYearly = products.proAnnual({
		id: "pro-yearly",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [proMonthly, proYearly] }),
		],
		actions: [],
	});

	await Promise.all([
		RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: proMonthly.id,
				revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
			},
		}),
		RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: proYearly.id,
				revenuecat_product_ids: [RC_PRO_YEARLY_ID],
			},
		}),
	]);

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	// First: initial purchase on monthly
	await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh3_tx_001",
	});

	await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "new",
		timeoutMs: 15000,
	});

	// Then: renewal to yearly (upgrade)
	await rcClient.renewal({
		productId: RC_PRO_YEARLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh3_tx_001",
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "upgrade",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.scenario).toBe("upgrade");
	expect(data.updated_product.id).toBe(proYearly.id);
	expect(data.customer.id).toBe(customerId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Downgrade → scenario: downgrade
// Uses premium ($50/mo) → pro ($20/mo) so the price decrease is a genuine downgrade
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("rc-webhook: downgrade (premium → pro) → scenario: downgrade")}`, async () => {
	const customerId = "rc-webhook-downgrade";
	const RC_PRO_ID = "com.app.rcwh4_pro";
	const RC_PREMIUM_ID = "com.app.rcwh4_premium";

	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});
	const premium = products.premium({
		id: "premium",
		items: [messagesItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	await Promise.all([
		RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: pro.id,
				revenuecat_product_ids: [RC_PRO_ID],
			},
		}),
		RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: premium.id,
				revenuecat_product_ids: [RC_PREMIUM_ID],
			},
		}),
	]);

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	// First: initial purchase on premium ($50/mo)
	await rcClient.initialPurchase({
		productId: RC_PREMIUM_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh4_tx_001",
	});

	await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "new",
		timeoutMs: 15000,
	});

	// Then: renewal to pro ($20/mo) — genuine downgrade
	await rcClient.renewal({
		productId: RC_PRO_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh4_tx_001",
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "downgrade",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.scenario).toBe("downgrade");
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer.id).toBe(customerId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Cancellation → scenario: cancel
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("rc-webhook: cancellation → scenario: cancel")}`, async () => {
	const customerId = "rc-webhook-cancel";
	const RC_PRO_MONTHLY_ID = "com.app.rcwh5_pro_monthly";

	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [proMonthly] }),
		],
		actions: [],
	});

	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: proMonthly.id,
			revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
		},
	});

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	// First: initial purchase
	await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh5_tx_001",
	});

	await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "new",
		timeoutMs: 15000,
	});

	// Then: cancellation
	await rcClient.cancellation({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh5_tx_001",
		expirationAtMs: Date.now() + 1000 * 60 * 60 * 24 * 30,
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "cancel",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.scenario).toBe("cancel");
	expect(data.updated_product.id).toBe(proMonthly.id);
	expect(data.customer.id).toBe(customerId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Uncancellation → scenario: renew
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("rc-webhook: uncancellation → scenario: renew")}`, async () => {
	const customerId = "rc-webhook-uncancel";
	const RC_PRO_MONTHLY_ID = "com.app.rcwh6_pro_monthly";

	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [proMonthly] }),
		],
		actions: [],
	});

	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: proMonthly.id,
			revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
		},
	});

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	// Step 1: initial purchase
	await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh6_tx_001",
	});

	await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "new",
		timeoutMs: 15000,
	});

	// Step 2: cancellation
	await rcClient.cancellation({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh6_tx_001",
		expirationAtMs: Date.now() + 1000 * 60 * 60 * 24 * 30,
	});

	await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "cancel",
		timeoutMs: 15000,
	});

	// Step 3: uncancellation
	await rcClient.uncancellation({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "renew",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.scenario).toBe("renew");
	expect(data.updated_product.id).toBe(proMonthly.id);
	expect(data.customer.id).toBe(customerId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Billing Issue → scenario: past_due
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("rc-webhook: billing issue → scenario: past_due")}`, async () => {
	const customerId = "rc-webhook-billing-issue";
	const RC_PRO_MONTHLY_ID = "com.app.rcwh7_pro_monthly";

	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [proMonthly] }),
		],
		actions: [],
	});

	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: proMonthly.id,
			revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
		},
	});

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	// First: initial purchase
	await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh7_tx_001",
	});

	await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "new",
		timeoutMs: 15000,
	});

	// Then: billing issue
	await rcClient.billingIssue({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh7_tx_001",
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "past_due",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.scenario).toBe("past_due");
	expect(data.updated_product.id).toBe(proMonthly.id);
	expect(data.customer.id).toBe(customerId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Expiration → scenario: expire
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("rc-webhook: expiration → scenario: expired")}`, async () => {
	const customerId = "rc-webhook-expire";
	const RC_PRO_MONTHLY_ID = "com.app.rcwh8_pro_monthly";

	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [proMonthly] }),
		],
		actions: [],
	});

	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: proMonthly.id,
			revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
		},
	});

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	// First: initial purchase
	await rcClient.initialPurchase({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh8_tx_001",
	});

	await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "new",
		timeoutMs: 15000,
	});

	// Then: expiration
	await rcClient.expiration({
		productId: RC_PRO_MONTHLY_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh8_tx_001",
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "expired",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.scenario).toBe("expired");
	expect(data.updated_product.id).toBe(proMonthly.id);
	expect(data.customer.id).toBe(customerId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Non-Renewing Purchase → scenario: new
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("rc-webhook: non-renewing purchase (add-on) → scenario: new")}`, async () => {
	const customerId = "rc-webhook-non-renewing";
	const RC_ADD_ON_ID = "com.app.rcwh9_add_on_pack";

	const addOnPack = products.base({
		id: "add-on",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
		isAddOn: true,
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [addOnPack] }),
		],
		actions: [],
	});

	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: addOnPack.id,
			revenuecat_product_ids: [RC_ADD_ON_ID],
		},
	});

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	await rcClient.nonRenewingPurchase({
		productId: RC_ADD_ON_ID,
		appUserId: customerId,
		originalTransactionId: "rcwh9_addon_tx_001",
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "new",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.scenario).toBe("new");
	expect(data.updated_product.id).toBe(addOnPack.id);
	expect(data.customer.id).toBe(customerId);
});
