/**
 * A plan edit reaches the catalog copies the balance workers hold, inside their TTL.
 *
 * Contract:
 *   - `plans.update({ disable_version, billing_controls })` edits the product row in place and publishes a
 *     catalog invalidation; every worker expires the org's cached rows.
 *   - A plan-level usage limit added after the worker cached the product gates the next `check`.
 *   - A plan-level usage alert added after the worker cached the product is decided on the next
 *     track and fires `balances.usage_alert_triggered` through herald.
 *
 * Red (no invalidation): the cache serves the product as first read for five minutes, so
 * `check` stays allowed and no alert fires.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { waitForUsageAlert } from "../utils/usage-alert-utils/usageAlertWebhookUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });
const rpc = new AutumnRpcCli({
	secretKey: ctx.orgSecretKey,
	version: ApiVersion.V2_1,
});

/** Kafka publish, consume and expiry: milliseconds in practice, given generously. */
const INVALIDATION_SETTLE_MS = 3000;
/** Herald reads the log behind the worker; give its first record time to land in its cache. */
const HERALD_SETTLE_MS = 3000;

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["balances.usage_alert_triggered"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(`${chalk.yellowBright("catalog-invalidation-worker: a plan usage limit added after the worker cached the product gates the next check")}`, async () => {
	const plan = products.base({
		id: "cat-inv-worker",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	const customerId = "cat-inv-worker-1";
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	// The worker caches the product as it is now: no cap.
	const before = await autumnV2_3.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(before.allowed).toBe(true);

	// In place: a new version would leave the customer on the row the caches already hold.
	await rpc.plans.update(plan.id, {
		disable_version: true,
		billing_controls: {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Day,
				},
			],
		},
	});
	await timeout(INVALIDATION_SETTLE_MS);

	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 5,
	});
	const after = await autumnV2_3.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(after.allowed).toBe(false);
});

test(`${chalk.yellowBright("catalog-invalidation-herald: a plan usage alert added after herald cached the product fires on the next crossing")}`, async () => {
	const plan = products.base({
		id: "cat-inv-herald",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const customerId = "cat-inv-herald-1";
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	// Herald caches the product as it is now: no alert.
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1,
	});
	await timeout(HERALD_SETTLE_MS);

	// In place: a new version would leave the customer on the row the caches already hold.
	await rpc.plans.update(plan.id, {
		disable_version: true,
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 50,
					threshold_type: "remaining",
					enabled: true,
				},
			],
		},
	});
	await timeout(INVALIDATION_SETTLE_MS);

	// 99 remaining → 39: crosses the alert herald could only know from the fresh row.
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 60,
	});
	await waitForUsageAlert({ token: playToken, customerId, threshold: 50 });
});
