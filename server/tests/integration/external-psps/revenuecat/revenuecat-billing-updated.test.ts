/**
 * Integration test: RevenueCat lifecycle webhooks emit `billing.updated`.
 *
 * RC has no Stripe subscription behind it, so these flows go through the
 * customer product lifecycle actions rather than the Stripe webhook handlers.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	expectBillingUpdatedCorrect,
	waitForBillingUpdatedWebhook,
} from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
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

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_12345";

const rcProMonthly = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret ===
		RC_WEBHOOK_SECRET
	) {
		return;
	}

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
};

const setupRevenueCatCustomer = async ({
	customerId,
	autumnProductId,
	revenuecatProductId,
	originalTransactionId,
}: {
	customerId: string;
	autumnProductId: string;
	revenuecatProductId: string;
	originalTransactionId: string;
}) => {
	const proMonthly = rcProMonthly({ id: autumnProductId });

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
			revenuecat_product_ids: [revenuecatProductId],
		},
	});

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	await rcClient.initialPurchase({
		productId: revenuecatProductId,
		appUserId: customerId,
		originalTransactionId,
	});

	return { proMonthly, rcClient };
};

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	await setupRevenueCatOrg();

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

test(`${chalk.yellowBright("billing.updated: revenuecat expiration → expired change")}`, async () => {
	const customerId = "rc-billing-updated-expire";
	const revenuecatProductId = "com.app.rcbu1_pro_monthly";

	const { proMonthly, rcClient } = await setupRevenueCatCustomer({
		customerId,
		autumnProductId: "rcbu1-pro-monthly",
		revenuecatProductId,
		originalTransactionId: "rcbu1_tx_001",
	});

	await rcClient.expiration({
		productId: revenuecatProductId,
		appUserId: customerId,
		originalTransactionId: "rcbu1_tx_001",
	});

	const data = await waitForBillingUpdatedWebhook({
		playToken,
		customerId,
		requireUpdatedChange: false,
		timeoutMs: 30_000,
	});

	expectBillingUpdatedCorrect({
		data,
		customerId,
		planChanges: [
			{ planId: proMonthly.id, action: "expired", status: "expired" },
		],
	});
});

test(`${chalk.yellowBright("billing.updated: revenuecat cancellation → updated change with canceled_at")}`, async () => {
	const customerId = "rc-billing-updated-cancel";
	const revenuecatProductId = "com.app.rcbu2_pro_monthly";

	const { proMonthly, rcClient } = await setupRevenueCatCustomer({
		customerId,
		autumnProductId: "rcbu2-pro-monthly",
		revenuecatProductId,
		originalTransactionId: "rcbu2_tx_001",
	});

	await rcClient.cancellation({
		productId: revenuecatProductId,
		appUserId: customerId,
		originalTransactionId: "rcbu2_tx_001",
	});

	const data = await waitForBillingUpdatedWebhook({
		playToken,
		customerId,
		timeoutMs: 30_000,
	});

	expectBillingUpdatedCorrect({
		data,
		customerId,
		planChanges: [{ planId: proMonthly.id, action: "updated" }],
	});

	const canceledChange = data?.plan_changes?.find(
		(change) => change.subscription?.plan_id === proMonthly.id,
	);
	expect(canceledChange?.previous_attributes).toHaveProperty("canceled_at");
});
