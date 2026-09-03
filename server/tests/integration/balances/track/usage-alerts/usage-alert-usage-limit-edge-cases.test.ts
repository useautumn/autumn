import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	ApiVersion,
	type EntityBillingControls,
	ResetInterval,
} from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	expectNoUsageAlert,
	waitForNextMinuteBucket,
	waitForUsageAlert,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { setCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { setEntityUsageLimit } from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";
import { expireUsageWindowForReset } from "../../utils/usage-limit-utils/expireUsageWindowForReset.js";

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

const usageLimitAlert = ({
	threshold,
	thresholdType = "usage_percentage",
}: {
	threshold: number;
	thresholdType?: "usage" | "usage_percentage" | "remaining";
}) => ({
	feature_id: TestFeature.Messages,
	basis: "usage_limit" as const,
	threshold,
	threshold_type: thresholdType,
	enabled: true,
});

const setupCappedCustomer = async ({
	customerId,
	planId,
	limit = 200,
}: {
	customerId: string;
	planId: string;
	limit?: number;
}) => {
	const plan = products.base({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 10000 })],
	});
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	await setCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		limit,
		interval: ResetInterval.Day,
		anchor: "utc",
	});
};

const track = ({
	customerId,
	value,
	entityId,
}: {
	customerId: string;
	value: number;
	entityId?: string;
}) =>
	autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value,
		...(entityId && { entity_id: entityId }),
	});

test(`${chalk.yellowBright("ul-edge1: a rollover mid-track never fires a remaining alert from yesterday's usage")}`, async () => {
	const customerId = "ul-edge-rollover-remaining-1";
	await setupCappedCustomer({
		customerId,
		planId: "ul-edge-rollover-remaining",
	});
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 5, thresholdType: "remaining" }),
		],
	});

	await track({ customerId, value: 190 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 5 });

	await expireUsageWindowForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	await waitForNextMinuteBucket();
	await track({ customerId, value: 1 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 5 });
});

test(`${chalk.yellowBright("ul-edge2: a usage_limit percentage above 100 can never fire because the cap clamps usage")}`, async () => {
	const customerId = "ul-edge-over-100-1";
	await setupCappedCustomer({ customerId, planId: "ul-edge-over-100" });
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 150 }),
			usageLimitAlert({ threshold: 100 }),
		],
	});

	await track({ customerId, value: 400 });
	const capped = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 100,
	});
	expect(capped.usage_limit?.usage).toBe(200);
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 150 });
});

test(`${chalk.yellowBright("ul-edge3: an entity alert on its own cap ignores a sibling entity's tracks")}`, async () => {
	const customerId = "ul-edge-sibling-entity-1";
	const plan = products.base({
		id: "ul-edge-sibling-entity",
		items: [
			items.monthlyMessages({
				includedUsage: 10000,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});
	const { entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [plan] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const [alerted, sibling] = entities;
	await setEntityUsageLimit({
		autumn: autumnV2_3,
		customerId,
		entityId: alerted.id,
		featureId: TestFeature.Messages,
		limit: 200,
		interval: ResetInterval.Day,
	});
	await autumnV2_3.entities.update(customerId, alerted.id, {
		billing_controls: {
			usage_alerts: [usageLimitAlert({ threshold: 80 })],
		} as EntityBillingControls,
	});

	await track({ customerId, value: 160, entityId: sibling.id });
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		entityId: alerted.id,
	});

	await track({ customerId, value: 160, entityId: alerted.id });
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		entityId: alerted.id,
	});
	expect(data.usage_limit?.usage).toBe(160);
});

test(`${chalk.yellowBright("ul-edge4: entity alerts dedupe on the full identity like customer alerts")}`, async () => {
	const customerId = "ul-edge-entity-dedup-1";
	const { entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({
				list: [
					products.base({
						id: "ul-edge-entity-dedup",
						items: [items.monthlyMessages({ includedUsage: 10000 })],
					}),
				],
			}),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: "ul-edge-entity-dedup" })],
	});
	const entityId = entities[0].id;
	await setEntityUsageLimit({
		autumn: autumnV2_3,
		customerId,
		entityId,
		featureId: TestFeature.Messages,
		limit: 200,
		interval: ResetInterval.Day,
	});

	await expectAutumnError({
		errMessage: "Only one usage alert entry",
		func: () =>
			autumnV2_3.entities.update(customerId, entityId, {
				billing_controls: {
					usage_alerts: [
						usageLimitAlert({ threshold: 80 }),
						usageLimitAlert({ threshold: 80 }),
					],
				} as EntityBillingControls,
			}),
	});
	await autumnV2_3.entities.update(customerId, entityId, {
		billing_controls: {
			usage_alerts: [
				usageLimitAlert({ threshold: 80 }),
				{ ...usageLimitAlert({ threshold: 80 }), basis: "balance" as const },
			],
		} as EntityBillingControls,
	});
});
