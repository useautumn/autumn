import { afterAll, beforeAll, expect, test } from "bun:test";
import type { EntityBillingControls } from "@autumn/shared";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import chalk from "chalk";
import { waitForUsageAlert } from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import {
	autumnV2_3,
	setDailyLimit,
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
