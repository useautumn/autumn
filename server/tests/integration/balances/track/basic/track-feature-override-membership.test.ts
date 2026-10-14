import { expect, test } from "bun:test";
import type { ApiCustomerV3, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const withFeatureOverride = (
	item: ReturnType<typeof items.free>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("feature-override membership: override adds a feature the catalog schema lacks")}`,
	async () => {
		const creditsItem = withFeatureOverride(
			items.free({ featureId: TestFeature.Credits2, includedUsage: 100 }),
			{
				schema: [
					{ metered_feature_id: TestFeature.Action3, credit_amount: 1.4 },
					{ metered_feature_id: TestFeature.Action2, credit_amount: 2 },
				],
			},
		);
		const freeProd = products.base({
			id: "free",
			items: [creditsItem],
		});

		const { customerId, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "override-membership-add",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const check = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			required_balance: 10,
		});
		expect(check.allowed).toBe(true);
		expect(check.required_balance).toBe(20);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 10,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits2]).toMatchObject({
			balance: 80,
			usage: 20,
		});

		await timeout(2000);
		const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerNonCached.features[TestFeature.Credits2]).toMatchObject({
			balance: 80,
			usage: 20,
		});
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("feature-override membership: override removes a feature the catalog schema has")}`,
	async () => {
		const action1Item = items.free({
			featureId: TestFeature.Action1,
			includedUsage: 50,
		});
		const creditsItem = withFeatureOverride(
			items.free({ featureId: TestFeature.Credits, includedUsage: 100 }),
			{
				schema: [
					{ metered_feature_id: TestFeature.Action2, credit_amount: 0.6 },
				],
			},
		);
		const freeProd = products.base({
			id: "free",
			items: [action1Item, creditsItem],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "override-membership-remove",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 60,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Action1]).toMatchObject({
			balance: 0,
			usage: 50,
		});
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 100,
			usage: 0,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 10,
		});
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerAfter.features[TestFeature.Credits]).toMatchObject({
			balance: 94,
			usage: 6,
		});
	},
	{ timeout: 120_000 },
);
