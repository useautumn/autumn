/**
 * TDD test for usage alert `basis` on balance-backed bases.
 *
 * Contract under test:
 *   New types/fields:
 *     - usage_alerts[].basis: "balance" | "included" | "recurring" | "usage_limit" (default "balance")
 *     - webhook usage_alert.basis always present
 *     - webhook balance { usage, granted, included, remaining } present when basis != usage_limit
 *   New behaviors:
 *     - basis balance   → denominator = granted (today's behaviour)
 *     - basis included  → denominator = Σ breakdown.included_grant
 *     - basis recurring → denominator = Σ (included_grant + prepaid_grant) where reset != null
 *     - remaining = max(0, denominator − usage) for remaining / remaining_percentage
 *     - denominator 0 → percentage alerts skip
 *     - unlimited feature → balance bases skip
 *     - one track crossing two thresholds fires both
 *
 * Pre-impl red: `basis` does not exist on DbUsageAlert (compile), then the
 * payload lacks basis/balance and included/recurring never fire at their own
 * denominators.
 * Post-impl green: measurement per basis feeds one crossing check and the
 * payload carries the basis + balance block.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ApiCustomerV5, ApiVersion } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	expectNoUsageAlert,
	waitForUsageAlert,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

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

const track = (customerId: string, value: number) =>
	autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value,
	});

/**
 * Monthly 1000 included + 500 prepaid (both reset) + 300 lifetime grant:
 *   balance = 1800, included = 1300, recurring = 1500.
 */
const setupMixedGrants = async ({
	customerId,
	planId,
}: {
	customerId: string;
	planId: string;
}) => {
	const plan = products.pro({
		id: planId,
		items: [
			items.prepaidMessages({
				includedUsage: 1000,
				billingUnits: 100,
				price: 10,
			}),
		],
	});
	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [
			s.attach({
				productId: plan.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
			}),
		],
	});
	await autumnV2_3.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		included_grant: 300,
	});

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	const breakdown = customer.balances[TestFeature.Messages]?.breakdown ?? [];
	const included = breakdown.reduce(
		(sum, entry) => sum + entry.included_grant,
		0,
	);
	const recurring = breakdown
		.filter(
			(entry) => entry.reset !== null && entry.reset.interval !== "one_off",
		)
		.reduce(
			(sum, entry) => sum + entry.included_grant + entry.prepaid_grant,
			0,
		);
	const granted = customer.balances[TestFeature.Messages]?.granted ?? 0;

	expect({ granted, included, recurring }).toEqual({
		granted: 1800,
		included: 1300,
		recurring: 1500,
	});
};

// ── A1: default basis is balance; payload carries basis + balance block ─────
test(`${chalk.yellowBright("alert-basis1: default basis balance, payload has basis and balance block")}`, async () => {
	const customerId = "alert-basis-default-1";
	const plan = products.base({
		id: "alert-basis-default",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 80,
				threshold_type: "usage_percentage",
				enabled: true,
			},
		],
	});

	await track(customerId, 800);

	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	expect(data.usage_alert.basis).toBe("balance");
	expect(data.usage_alert.filter).toBeUndefined();
	expect(data.usage_limit).toBeUndefined();
	expect(data.balance).toEqual({
		usage: 800,
		granted: 1000,
		included: 1000,
		remaining: 200,
	});
});

// ── A2 + A3: included and recurring use their own denominators ──────────────
test(`${chalk.yellowBright("alert-basis2: included and recurring fire at their own denominators, balance last")}`, async () => {
	const customerId = "alert-basis-mixed-1";
	await setupMixedGrants({ customerId, planId: "alert-basis-mixed" });

	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 80,
				threshold_type: "usage_percentage",
				basis: "included",
				enabled: true,
			},
			{
				feature_id: TestFeature.Messages,
				threshold: 80,
				threshold_type: "usage_percentage",
				basis: "recurring",
				enabled: true,
			},
			{
				feature_id: TestFeature.Messages,
				threshold: 80,
				threshold_type: "usage_percentage",
				basis: "balance",
				enabled: true,
			},
		],
	});

	// 1100 / 1300 = 84.6% of included; 73% of recurring; 61% of balance.
	await track(customerId, 1100);
	const includedFire = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		basis: "included",
	});
	expect(includedFire.balance).toEqual({
		usage: 1100,
		granted: 1800,
		included: 1300,
		remaining: 200,
	});
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		basis: "recurring",
	});
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		basis: "balance",
		timeoutMs: 1000,
	});

	// 1300 / 1500 = 86.7% of recurring; 72% of balance.
	await track(customerId, 200);
	const recurringFire = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		basis: "recurring",
	});
	expect(recurringFire.balance?.usage).toBe(1300);
	expect(recurringFire.balance?.remaining).toBe(200);
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		basis: "balance",
	});

	// 1500 / 1800 = 83.3% of balance.
	await track(customerId, 200);
	const balanceFire = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		basis: "balance",
	});
	expect(balanceFire.balance).toEqual({
		usage: 1500,
		granted: 1800,
		included: 1300,
		remaining: 300,
	});
});

// ── A4: remaining under included = max(0, included − usage) ─────────────────
test(`${chalk.yellowBright("alert-basis3: remaining and remaining_percentage under included")}`, async () => {
	const customerId = "alert-basis-remaining-1";
	await setupMixedGrants({ customerId, planId: "alert-basis-remaining" });

	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 100,
				threshold_type: "remaining",
				basis: "included",
				enabled: true,
			},
			{
				feature_id: TestFeature.Messages,
				threshold: 10,
				threshold_type: "remaining_percentage",
				basis: "included",
				enabled: true,
			},
		],
	});

	// included remaining = 1300 − 1210 = 90 (≤ 100, 6.9% ≤ 10%); balance remaining is 590.
	await track(customerId, 1210);
	const remainingFire = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 100,
	});
	expect(remainingFire.usage_alert.threshold_type).toBe("remaining");
	expect(remainingFire.balance?.remaining).toBe(90);
	const remainingPercentFire = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 10,
	});
	expect(remainingPercentFire.usage_alert.threshold_type).toBe(
		"remaining_percentage",
	);

	// Usage past the included denominator clamps remaining to 0, never negative.
	await track(customerId, 200);
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expect(customer.balances[TestFeature.Messages]?.usage).toBe(1410);
});

// ── A5: included = 0 skips percentage alerts ────────────────────────────────
test(`${chalk.yellowBright("alert-basis4: included = 0 skips a percentage alert on basis included")}`, async () => {
	const customerId = "alert-basis-zero-included-1";
	const plan = products.pro({
		id: "alert-basis-zero-included",
		items: [
			items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});
	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [
			s.attach({
				productId: plan.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
			}),
		],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 50,
				threshold_type: "usage_percentage",
				basis: "included",
				enabled: true,
			},
		],
	});

	await track(customerId, 400);
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 50 });
});

// ── A6: unlimited feature skips balance bases ───────────────────────────────
test(`${chalk.yellowBright("alert-basis5: unlimited feature never fires a balance-basis alert")}`, async () => {
	const customerId = "alert-basis-unlimited-1";
	const plan = products.base({
		id: "alert-basis-unlimited",
		items: [items.unlimitedMessages()],
	});
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 10,
				threshold_type: "usage",
				basis: "included",
				enabled: true,
			},
		],
	});

	await track(customerId, 50);
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 10 });
});

// ── A7: one bulk track crosses 80 and 100 on basis included ─────────────────
test(`${chalk.yellowBright("alert-basis6: bulk track crossing two thresholds fires both")}`, async () => {
	const customerId = "alert-basis-bulk-1";
	const plan = products.base({
		id: "alert-basis-bulk",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 80,
				threshold_type: "usage_percentage",
				basis: "included",
				enabled: true,
			},
			{
				feature_id: TestFeature.Messages,
				threshold: 100,
				threshold_type: "usage_percentage",
				basis: "included",
				enabled: true,
			},
		],
	});

	await track(customerId, 1000);
	const eighty = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	const hundred = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 100,
	});
	expect(eighty.usage_alert.basis).toBe("included");
	expect(hundred.balance?.remaining).toBe(0);
});
