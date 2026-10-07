/**
 * Usage alerts with `basis: "usage_limit"`: the cap's window-counter usage over
 * its limit drives the crossing check; the webhook carries a usage_limit block.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { type EntityBillingControls, ResetInterval } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	expectNoUsageAlert,
	waitForUsageAlert,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { setEntityUsageLimit } from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";
import {
	autumnV2_3,
	setDailyLimit,
	setupCustomer,
	track,
	usageLimitAlert,
} from "./utils/usageAlertUsageLimit.js";

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

// ── B8b: an entity's own cap is not the customer alert's cap ────────────────
test(`${chalk.yellowBright("ul-alert14: a customer alert ignores an entity-owned cap on entity tracks")}`, async () => {
	const customerId = "ul-alert-entity-override-1";
	const entity = await setupCustomer({
		customerId,
		planId: "ul-alert-entity-override",
		withEntity: true,
	});
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});
	await setEntityUsageLimit({
		autumn: autumnV2_3,
		customerId,
		entityId: entity!.id,
		featureId: TestFeature.Messages,
		limit: 100,
		interval: ResetInterval.Day,
	});

	await track({ customerId, value: 90, entityId: entity!.id });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
});

// ── B8c: an entity alert may point at the cap it inherits from the customer ─
test(`${chalk.yellowBright("ul-alert15: an entity alert on an inherited customer cap fires with the entity id")}`, async () => {
	const customerId = "ul-alert-entity-inherited-alert-1";
	const entity = await setupCustomer({
		customerId,
		planId: "ul-alert-entity-inherited-alert",
		withEntity: true,
	});
	await setDailyLimit(customerId);
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
	expect(data.usage_limit?.limit).toBe(200);
	expect(data.usage_limit?.usage).toBe(160);
});
