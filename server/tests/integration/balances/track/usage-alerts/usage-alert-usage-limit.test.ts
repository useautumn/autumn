/**
 * TDD test for usage alerts with `basis: "usage_limit"`.
 *
 * Contract under test:
 *   New types/fields:
 *     - usage_alerts[].basis = "usage_limit", usage_alerts[].filter (UsageLimitFilter)
 *     - webhook usage_alert.basis + usage_alert.filter (iff set)
 *     - webhook usage_limit { limit, interval, anchor, usage, remaining, window_start_at, window_end_at }
 *       present iff basis is usage_limit; balance block absent
 *   New behaviors:
 *     - numerator = window counter usage, denominator = limit.limit, matched on (feature_id, filterKey)
 *     - filtered alert only reacts to tracks matching the filter; filter values canonicalise (123 == "123")
 *     - limit may come from customer, plan, or entity (resolved as enforcement resolves it)
 *     - limit removed or disabled after the alert exists → alert dormant
 *     - entity-owned limit → entity counter + entity_id; inherited customer limit → aggregate counter
 *     - unlimited feature → no fire
 *     - re-fires each window; old usage reads 0 after rollover (no false remaining alert)
 *     - bulk track crossing two thresholds fires both; two caps alert independently
 *     - limit 0 → no fire, no error
 *   Side effects:
 *     - svix idempotency key distinguishes basis, filter and window start
 *
 * Pre-impl red: `basis` / `filter` do not exist on DbUsageAlert (compile), then
 * usage_limit alerts evaluate against the balance or never fire.
 * Post-impl green: window-counter measurement drives the crossing check.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	ApiVersion,
	type CustomerBillingControls,
	type EntityBillingControls,
	ms,
	ResetInterval,
} from "@autumn/shared";
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
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	countUsageAlertWebhooks,
	expectNoUsageAlert,
	waitForNextMinuteBucket,
	waitForUsageAlert,
	waitForUsageAlertCount,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { setCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { setEntityUsageLimit } from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";
import { expectUsageLimitWindowContains } from "../../utils/usage-limit-utils/expectUsageLimitWindowContains.js";
import { expireUsageWindowForReset } from "../../utils/usage-limit-utils/expireUsageWindowForReset.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });
const numericFilterValue = (value: number) => value as unknown as string;

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

const messagesPlan = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 10000 })],
	});

const setupCustomer = async ({
	customerId,
	planId,
	plan = messagesPlan(planId),
	withEntity = false,
}: {
	customerId: string;
	planId: string;
	plan?: ReturnType<typeof products.base>;
	withEntity?: boolean;
}) => {
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [plan] }),
			...(withEntity
				? [s.entities({ count: 1, featureId: TestFeature.Users })]
				: []),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	return scenario.entities?.[0];
};

const setDailyLimit = (customerId: string, limit = 200) =>
	setCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		limit,
		interval: ResetInterval.Day,
		anchor: "utc",
	});

const setUsageLimits = async ({
	customerId,
	usageLimits,
}: {
	customerId: string;
	usageLimits: NonNullable<CustomerBillingControls["usage_limits"]>;
}) => {
	await timeout(2000);
	await autumnV2_3.customers.update(customerId, {
		billing_controls: { usage_limits: usageLimits },
	});
	await timeout(3000);
};

const usageLimitAlert = ({
	threshold = 80,
	thresholdType = "usage_percentage",
	filter,
}: {
	threshold?: number;
	thresholdType?:
		| "usage"
		| "usage_percentage"
		| "remaining"
		| "remaining_percentage";
	filter?: { properties: Record<string, string> };
} = {}) => ({
	feature_id: TestFeature.Messages,
	threshold,
	threshold_type: thresholdType,
	basis: "usage_limit" as const,
	enabled: true,
	...(filter && { filter }),
});

const track = ({
	customerId,
	value,
	properties,
	entityId,
}: {
	customerId: string;
	value: number;
	properties?: Record<string, unknown>;
	entityId?: string;
}) =>
	autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value,
		...(entityId && { entity_id: entityId }),
		...(properties && { properties }),
	});

// ── B1: basic usage_limit alert with full usage_limit block ─────────────────
test(`${chalk.yellowBright("ul-alert1: 80% of a 200/day cap fires with the usage_limit block")}`, async () => {
	const customerId = "ul-alert-basic-1";
	await setupCustomer({ customerId, planId: "ul-alert-basic" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	const trackedAt = Date.now();
	await track({ customerId, value: 160 });

	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	expect(data.usage_alert.basis).toBe("usage_limit");
	expect(data.usage_alert.filter).toBeUndefined();
	expect(data.balance).toBeUndefined();
	expect(data.usage_limit).toMatchObject({
		limit: 200,
		interval: "day",
		anchor: "utc",
		usage: 160,
		remaining: 40,
	});
	expectUsageLimitWindowContains({
		usageLimit: data.usage_limit,
		at: trackedAt,
		intervalMs: ms.days(1),
	});
});

// ── B2 + B3: filtered cap, filter echoed, non-matching tracks ignored,
// numeric vs string filter values canonicalise ──────────────────────────────
test(`${chalk.yellowBright("ul-alert2: filtered cap alert reacts only to matching tracks and canonicalises filter values")}`, async () => {
	const customerId = "ul-alert-filter-1";
	await setupCustomer({ customerId, planId: "ul-alert-filter" });
	await setUsageLimits({
		customerId,
		usageLimits: [
			{
				feature_id: TestFeature.Messages,
				enabled: true,
				limit: 200,
				interval: ResetInterval.Day,
				anchor: "utc",
				filter: { properties: { apiKeyId: numericFilterValue(123) } },
			},
		],
	});
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({
				threshold: 80,
				filter: { properties: { apiKeyId: "123" } },
			}),
		],
	});

	await track({ customerId, value: 160, properties: { apiKeyId: "other" } });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });

	await track({ customerId, value: 160, properties: { apiKeyId: 123 } });
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	expect(data.usage_alert.filter).toEqual({ properties: { apiKeyId: "123" } });
	expect(data.usage_limit?.usage).toBe(160);
	expect(data.usage_limit?.remaining).toBe(40);
});

// ── B4: plan-supplied limit + customer alert ────────────────────────────────
test(`${chalk.yellowBright("ul-alert3: customer alert resolves a plan-level cap")}`, async () => {
	const customerId = "ul-alert-plan-limit-1";
	const plan = products.base({
		id: "ul-alert-plan-limit",
		items: [items.monthlyMessages({ includedUsage: 10000 })],
		billingControls: {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 200,
					interval: ResetInterval.Day,
					anchor: "utc",
				},
			],
		},
	});
	await setupCustomer({ customerId, planId: plan.id, plan });
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	await track({ customerId, value: 160 });
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	expect(data.usage_limit?.limit).toBe(200);
	expect(data.usage_limit?.usage).toBe(160);
});

// ── B5: limit removed after the alert exists → dormant ──────────────────────
test(`${chalk.yellowBright("ul-alert4: removing the cap leaves the alert dormant")}`, async () => {
	const customerId = "ul-alert-removed-1";
	await setupCustomer({ customerId, planId: "ul-alert-removed" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});
	await setUsageLimits({ customerId, usageLimits: [] });

	await track({ customerId, value: 160 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
});

// ── B6: limit disabled → quiet, not silently rebased onto the allowance ─────
test(`${chalk.yellowBright("ul-alert5: disabling the cap silences the alert")}`, async () => {
	const customerId = "ul-alert-disabled-1";
	await setupCustomer({ customerId, planId: "ul-alert-disabled" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});
	await setUsageLimits({
		customerId,
		usageLimits: [
			{
				feature_id: TestFeature.Messages,
				enabled: false,
				limit: 200,
				interval: ResetInterval.Day,
				anchor: "utc",
			},
		],
	});

	// 8000 / 10000 would be 80% of the plan allowance; the alert must not rebase.
	await track({ customerId, value: 8000 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
});

// ── B7: entity-owned limit → entity counter, entity_id in payload ───────────
test(`${chalk.yellowBright("ul-alert6: entity-owned cap alerts on the entity counter")}`, async () => {
	const customerId = "ul-alert-entity-own-1";
	const plan = products.base({
		id: "ul-alert-entity-own",
		items: [
			items.monthlyMessages({
				includedUsage: 10000,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});
	const entity = await setupCustomer({
		customerId,
		planId: plan.id,
		plan,
		withEntity: true,
	});
	await setEntityUsageLimit({
		autumn: autumnV2_3,
		customerId,
		entityId: entity!.id,
		featureId: TestFeature.Messages,
		limit: 200,
		interval: ResetInterval.Day,
	});
	await autumnV2_3.entities.update(customerId, entity!.id, {
		billing_controls: {
			usage_alerts: [usageLimitAlert({ threshold: 80 })],
		} as EntityBillingControls,
	});

	await track({ customerId, value: 160, entityId: entity!.id });
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		entityId: entity!.id,
	});
	expect(data.entity_id).toBe(entity!.id);
	expect(data.usage_limit?.usage).toBe(160);
	expect(data.usage_limit?.limit).toBe(200);
});

// ── B8: customer limit inherited by an entity → aggregate counter ───────────
test(`${chalk.yellowBright("ul-alert7: customer cap inherited by an entity alerts at customer scope on entity tracks")}`, async () => {
	const customerId = "ul-alert-entity-inherit-1";
	const entity = await setupCustomer({
		customerId,
		planId: "ul-alert-entity-inherit",
		withEntity: true,
	});
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	await track({ customerId, value: 100, entityId: entity!.id });
	await track({ customerId, value: 60, entityId: entity!.id });
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	expect(data.entity_id).toBeUndefined();
	expect(data.usage_limit?.usage).toBe(160);
});

// ── B9: unlimited feature + usage_limit alert → never fires ─────────────────
test(`${chalk.yellowBright("ul-alert8: unlimited feature never fires a usage_limit alert")}`, async () => {
	const customerId = "ul-alert-unlimited-1";
	const plan = products.base({
		id: "ul-alert-unlimited",
		items: [items.unlimitedMessages()],
	});
	await setupCustomer({ customerId, planId: plan.id, plan });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	await track({ customerId, value: 160 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
});

// ── B10: re-fires in the next window ────────────────────────────────────────
test(`${chalk.yellowBright("ul-alert9: the alert fires again after the window rolls over")}`, async () => {
	const customerId = "ul-alert-refire-1";
	await setupCustomer({ customerId, planId: "ul-alert-refire" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	await track({ customerId, value: 160 });
	await waitForUsageAlert({ token: playToken, customerId, threshold: 80 });

	await timeout(4000);
	await expireUsageWindowForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
		shiftMs: ms.days(1),
	});
	await waitForNextMinuteBucket();

	await track({ customerId, value: 160 });
	await waitForUsageAlertCount({
		token: playToken,
		customerId,
		threshold: 80,
		count: 2,
	});
});

// ── B11: rollover never produces a false remaining alert ────────────────────
test(`${chalk.yellowBright("ul-alert10: a rolled-over window measures a fresh cap so remaining re-arms")}`, async () => {
	const customerId = "ul-alert-rollover-1";
	await setupCustomer({ customerId, planId: "ul-alert-rollover" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 150, thresholdType: "remaining" }),
		],
	});

	// 200 → 100 remaining crosses 150 on the way down.
	await track({ customerId, value: 100 });
	await waitForUsageAlert({ token: playToken, customerId, threshold: 150 });

	await timeout(4000);
	await expireUsageWindowForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
		shiftMs: ms.days(1),
	});
	await waitForNextMinuteBucket();

	// A stale "before" of 100 remaining would already sit under 150 and suppress this.
	await track({ customerId, value: 60 });
	await waitForUsageAlertCount({
		token: playToken,
		customerId,
		threshold: 150,
		count: 2,
	});
});

// ── B12: bulk track crosses 80 and 100 on the window path ───────────────────
test(`${chalk.yellowBright("ul-alert11: one track crossing 80% and 100% of the cap fires both")}`, async () => {
	const customerId = "ul-alert-bulk-1";
	await setupCustomer({ customerId, planId: "ul-alert-bulk" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 80 }),
			usageLimitAlert({ threshold: 100 }),
		],
	});

	await track({ customerId, value: 200 });
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
	expect(eighty.usage_limit?.usage).toBe(200);
	expect(hundred.usage_limit?.remaining).toBe(0);
});

// ── B13: filtered and unfiltered caps alert independently ───────────────────
test(`${chalk.yellowBright("ul-alert12: filtered and unfiltered caps alert independently")}`, async () => {
	const customerId = "ul-alert-two-caps-1";
	await setupCustomer({ customerId, planId: "ul-alert-two-caps" });
	await setUsageLimits({
		customerId,
		usageLimits: [
			{
				feature_id: TestFeature.Messages,
				enabled: true,
				limit: 200,
				interval: ResetInterval.Day,
				anchor: "utc",
			},
			{
				feature_id: TestFeature.Messages,
				enabled: true,
				limit: 50,
				interval: ResetInterval.Day,
				anchor: "utc",
				filter: { properties: { apiKeyId: "key-a" } },
			},
		],
	});
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 80 }),
			usageLimitAlert({
				threshold: 80,
				filter: { properties: { apiKeyId: "key-a" } },
			}),
		],
	});

	// 40 / 50 = 80% of the filtered cap, 20% of the unfiltered one.
	await track({ customerId, value: 40, properties: { apiKeyId: "key-a" } });
	const filtered = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: "apiKeyId=key-a",
	});
	expect(filtered.usage_limit?.limit).toBe(50);
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: "",
	});

	// 160 / 200 = 80% of the unfiltered cap; the filtered counter is untouched.
	await track({ customerId, value: 120, properties: { apiKeyId: "key-b" } });
	const unfiltered = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: "",
	});
	expect(unfiltered.usage_limit?.limit).toBe(200);
	expect(unfiltered.usage_limit?.usage).toBe(160);
	expect(
		await countUsageAlertWebhooks({
			token: playToken,
			customerId,
			threshold: 80,
			filterKey: "apiKeyId=key-a",
		}),
	).toBe(1);
});

// ── B15: limit 0 → percentage skips, nothing throws ─────────────────────────
test(`${chalk.yellowBright("ul-alert13: a zero cap never fires and never divides by zero")}`, async () => {
	const customerId = "ul-alert-zero-1";
	await setupCustomer({ customerId, planId: "ul-alert-zero" });
	await setDailyLimit(customerId, 0);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 80 }),
			usageLimitAlert({ threshold: 0, thresholdType: "usage" }),
		],
	});

	await track({ customerId, value: 5 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 0,
		timeoutMs: 1000,
	});
});
