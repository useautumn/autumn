/**
 * Contract: a plan item's feature_override supersedes the feature-level
 * config for customers attached through that item — deduction rates come
 * from the override's schema, not the catalog, on both the cached (Redis)
 * and persisted paths, including graduated overrides over a flat base.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// Catalog rate for Action1 in the Credits system is 0.2 credits/unit
// (see v2Features.ts); the overrides below must win over it.

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

		// 40 units * 0.5 (override) = 20 credits — not 40 * 0.2 = 8 (catalog).
		const expectedCost = new Decimal(trackValue).mul(overrideCost).toNumber();
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 100 - expectedCost,
			usage: expectedCost,
		});

		// Persisted path agrees with the cached path.
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
		// Catalog Credits schema is flat; the item override is graduated:
		// first 100 units at 1 credit, everything past at 0.5.
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

		// 150 units: 100 * 1 + 50 * 0.5 = 125 credits.
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

		// The next 50 units continue from the tier position: all at 0.5 = 25.
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
		// Same credit system, no override — the catalog 0.2 rate applies.
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

		// 40 * 0.2 = 8 credits.
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 92,
			usage: 8,
		});
	},
);
