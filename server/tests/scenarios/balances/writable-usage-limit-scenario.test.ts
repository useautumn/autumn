import { test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_3 });
const customerId = "writable-usage-dashboard";
const productId = "writable-usage-dashboard-plan";

test(`${chalk.yellowBright("scenario: writable usage limits dashboard QA")}`, async () => {
	const product = products.base({
		id: productId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
		billingControls: {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					limit: 100,
					interval: ResetInterval.Day,
				},
			],
		},
	});
	const { entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [product] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId })],
	});

	await autumn.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 23,
	});
	await autumn.entities.update(customerId, entities[0].id, {
		billing_controls: {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					limit: 50,
					interval: ResetInterval.Day,
				},
			],
		},
	});
	await autumn.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 11,
	});

	console.log(
		`Dashboard QA customer: ${customerId}; entity: ${entities[0].id}; plan: ${productId}`,
	);
});
