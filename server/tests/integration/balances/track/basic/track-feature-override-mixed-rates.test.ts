/**
 * Contract: rates are per customer entitlement, not per credit system. When a
 * customer holds two balances of the same credit system — one at the catalog
 * rate, one with a plan-item feature_override — a track that spills across
 * both prices each funded portion at its own balance's rate.
 *
 * Catalog rate for Action1 in Credits is 0.2 credits/unit (v2Features.ts);
 * the add-on's override prices it at 1 credit/unit.
 */

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
		// Base plan: 10 Credits at the catalog rate (Action1 = 0.2/unit).
		const baseProduct = products.base({
			id: "mixed-rate-base",
			items: [
				items.free({ featureId: TestFeature.Credits, includedUsage: 10 }),
			],
		});
		// Add-on: 100 Credits with an override (Action1 = 1/unit).
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

		// 80 units. The base balance funds at 0.2/unit: its 10 credits cover the
		// first 50 units (50 * 0.2 = 10). The remaining 30 units hit the add-on
		// balance at its override rate: 30 * 1 = 30 credits.
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 80,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		// Combined Credits pool: 110 granted - (10 + 30) deducted = 70.
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 70,
			usage: 40,
		});

		// Persisted path agrees with the cached path.
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
