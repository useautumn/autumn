import { test } from "bun:test";
import {
	ApiVersion,
	type CustomerBillingControls,
	type EntityBillingControls,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });
const customerId = "usage-alert-basis-dashboard";
const apiKeyFilter = { properties: { apiKeyId: "key-a" } };

const customerBillingControls = {
	usage_limits: [
		{
			feature_id: TestFeature.Messages,
			limit: 200,
			interval: ResetInterval.Day,
			anchor: "utc",
		},
		{
			feature_id: TestFeature.Messages,
			limit: 50,
			interval: ResetInterval.Day,
			anchor: "utc",
			filter: apiKeyFilter,
		},
	],
	usage_alerts: [
		{
			feature_id: TestFeature.Messages,
			threshold_type: "usage_percentage",
			threshold: 50,
		},
		{
			feature_id: TestFeature.Messages,
			basis: "included",
			threshold_type: "usage",
			threshold: 500,
		},
		{
			feature_id: TestFeature.Messages,
			basis: "recurring",
			threshold_type: "usage_percentage",
			threshold: 90,
		},
		{
			feature_id: TestFeature.Messages,
			basis: "usage_limit",
			threshold_type: "remaining",
			threshold: 20,
		},
		{
			feature_id: TestFeature.Messages,
			basis: "usage_limit",
			filter: apiKeyFilter,
			threshold_type: "usage_percentage",
			threshold: 50,
		},
	],
} as CustomerBillingControls;

const entityBillingControls = {
	usage_limits: [
		{
			feature_id: TestFeature.Messages,
			limit: 100,
			interval: ResetInterval.Day,
			anchor: "utc",
		},
	],
	usage_alerts: [
		{
			feature_id: TestFeature.Messages,
			basis: "usage_limit",
			threshold_type: "usage_percentage",
			threshold: 80,
		},
	],
} as EntityBillingControls;

test(
	`${chalk.yellowBright("scenario: usage alerts by basis")}`,
	async () => {
		const plan = products.base({
			id: "usage-alert-basis-pro",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [plan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const entityId = entities[0].id;

		await autumnV2_3.customers.update(customerId, {
			billing_controls: customerBillingControls,
		});
		await autumnV2_3.entities.update(customerId, entityId, {
			billing_controls: entityBillingControls,
		});
		await timeout(3000);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
			properties: apiKeyFilter.properties,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 40,
		});

		console.log("usage alert basis scenario:", {
			customerId,
			entityId,
			dashboard: `http://localhost:3000/customers/${customerId}`,
			featureId: TestFeature.Messages,
			customerLimits: "daily 200 (any), daily 50 (apiKeyId=key-a)",
			customerAlerts:
				"balance 50%; included usage 500; recurring 90%; usage_limit remaining 20; usage_limit@key-a 50%",
			entity: "daily 100 cap, usage_limit alert at 80%",
			tracked: "120 plain, 30 @key-a (fires 50% filtered alert), 40 via entity",
		});
	},
	{ timeout: 120_000 },
);
