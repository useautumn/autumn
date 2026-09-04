/**
 * Contract: dimensions price a track drawn from a pooled credit balance exactly
 * as they do a private one. Pooling decides WHOSE balance is deducted; the
 * dimension decides HOW MUCH — the two are orthogonal.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const GRANT = 1_000;

const dimensionedAction1: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
			},
			multipliers: {
				spot: { match: { lifecycle: "spot" }, factor: 0.5 },
			},
		},
	],
};

test.concurrent(
	`${chalk.yellowBright("pooled credit dimensions: a pooled balance is deducted at the matched rate")}`,
	async () => {
		const customerId = "pooled-credit-dimensions";
		const product = products.base({
			id: "pooled-credit-dimensions",
			items: [
				{
					...items.monthlyCredits({ includedUsage: GRANT }),
					pooled: true,
					config: {
						...items.monthlyCredits({ includedUsage: GRANT }).config,
						feature_override: dimensionedAction1,
					},
				},
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({ productId: product.id, entityIndex: 0 }),
				// Both entities draw from the same pool at different dimensioned rates.
				s.track({
					featureId: TestFeature.Action1,
					value: 2,
					entityIndex: 0,
					properties: { size: "large" },
					timeout: 2_000,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 4,
					entityIndex: 1,
					properties: { size: "large", lifecycle: "spot" },
					timeout: 2_000,
				}),
			],
		});

		// 2 x 16 = 32, then 4 x 16 x 0.5 = 32 — both off the shared pool.
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: GRANT - 64,
			usage: 64,
		});
	},
);
