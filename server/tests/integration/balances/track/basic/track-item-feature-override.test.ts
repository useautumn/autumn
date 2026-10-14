import { expect, test } from "bun:test";
import type { ApiCustomerV3, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

const withFeatureOverride = (
	item: ReturnType<typeof items.free>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("track-item-feature-override: flat schema override wins over the catalog rate")}`,
	async () => {
		const overrideCost = 0.5;
		const creditsItem = withFeatureOverride(
			items.free({ featureId: TestFeature.Credits, includedUsage: 100 }),
			{
				schema: [
					{
						metered_feature_id: TestFeature.Action1,
						credit_amount: overrideCost,
					},
					{ metered_feature_id: TestFeature.Action2, credit_amount: 0.6 },
				],
			},
		);
		const freeProd = products.base({
			id: "free",
			items: [creditsItem],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "item-feature-override-flat",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const trackValue = 40;

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: trackValue,
		});

		const expectedCost = new Decimal(trackValue).mul(overrideCost).toNumber();
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 100 - expectedCost,
			usage: expectedCost,
		});

		await timeout(2000);
		const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerNonCached.features[TestFeature.Credits]).toMatchObject({
			balance: 100 - expectedCost,
			usage: expectedCost,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-item-feature-override: graduated schema override over a flat catalog base")}`,
	async () => {
		const creditsItem = withFeatureOverride(
			items.free({ featureId: TestFeature.Credits, includedUsage: 1_000 }),
			{
				schema: [
					{
						metered_feature_id: TestFeature.Action1,
						tier_behavior: "graduated",
						tiers: [
							{ to: 100, credit_amount: 1 },
							{ to: "inf", credit_amount: 0.5 },
						],
					},
				],
			},
		);
		const freeProd = products.base({
			id: "free",
			items: [creditsItem],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "item-feature-override-graduated",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 150,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 1_000 - 125,
			usage: 125,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 50,
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerAfter.features[TestFeature.Credits]).toMatchObject({
			balance: 1_000 - 150,
			usage: 150,
		});

		await timeout(2000);
		const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerNonCached.features[TestFeature.Credits]).toMatchObject({
			balance: 1_000 - 150,
			usage: 150,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-item-feature-override: non-overridden plans keep the catalog rate")}`,
	async () => {
		const creditsItem = items.free({
			featureId: TestFeature.Credits,
			includedUsage: 100,
		});
		const freeProd = products.base({
			id: "free",
			items: [creditsItem],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "item-feature-override-baseline",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 40,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 92,
			usage: 8,
		});
	},
);
