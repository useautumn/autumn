import { afterAll, beforeAll, expect, test } from "bun:test";
import { type EntityBillingControls, ResetInterval } from "@autumn/shared";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import chalk from "chalk";
import { waitForUsageAlert } from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { setEntityUsageLimit } from "../../../utils/usage-limit-utils/entityUsageLimitUtils.js";
import {
	autumnV2_3,
	setupCustomer,
	setupUsageAlertWebhook,
	track,
	usageLimitAlert,
} from "./usageAlertUsageLimitUtils.js";

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	webhook = await setupUsageAlertWebhook();
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
