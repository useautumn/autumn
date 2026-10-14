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
	`${chalk.yellowBright("feature-override mixed rates: each balance deducts at its own rate when a track spans both")}`,
	async () => {
		const baseProduct = products.base({
			id: "mixed-rate-base",
			items: [
				items.free({ featureId: TestFeature.Credits, includedUsage: 10 }),
			],
		});
		const addOnProduct = products.base({
			id: "mixed-rate-addon",
			isAddOn: true,
			items: [
				withFeatureOverride(
					items.free({ featureId: TestFeature.Credits, includedUsage: 100 }),
					{
						schema: [
							{ metered_feature_id: TestFeature.Action1, credit_amount: 1 },
						],
					},
				),
			],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "override-mixed-rates",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [baseProduct, addOnProduct] }),
			],
			actions: [
				s.attach({ productId: baseProduct.id }),
				s.attach({ productId: addOnProduct.id }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 80,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 70,
			usage: 40,
		});

		await timeout(3000);
		const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerNonCached.features[TestFeature.Credits]).toMatchObject({
			balance: 70,
			usage: 40,
		});
	},
	{ timeout: 120_000 },
);
