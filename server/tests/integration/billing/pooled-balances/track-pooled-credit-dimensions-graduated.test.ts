/**
 * Contract: a graduated dimension climbs its own ladder against a pooled
 * balance. Tier progress is tracked per dimension, so usage from two entities
 * sharing the pool advances the same ladder rather than each starting at tier 1.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const GRANT = 1_000;

const graduatedDimension: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				xl: {
					match: { size: "xl" },
					tier_behavior: "graduated" as const,
					tiers: [
						{ to: 5, credit_amount: 10 },
						{ to: "inf" as const, credit_amount: 4 },
					],
				},
			},
		},
	],
};

test.concurrent(
	`${chalk.yellowBright("pooled graduated dimension: both entities advance one shared ladder")}`,
	async () => {
		const customerId = "pooled-graduated-dimensions";
		const creditItem = items.monthlyCredits({ includedUsage: GRANT });
		const product = products.base({
			id: "pooled-graduated-dimensions",
			items: [
				{
					...creditItem,
					pooled: true,
					config: {
						...creditItem.config,
						feature_override: graduatedDimension,
					},
				},
			],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({ productId: product.id, entityIndex: 0 }),
				// 3 units from one entity, 4 from the other: 7 total up one ladder,
				// so 5 @ 10 then 2 @ 4 = 58 — not two ladders of 3 and 4.
				s.track({
					featureId: TestFeature.Action1,
					value: 3,
					entityIndex: 0,
					properties: { size: "xl" },
					timeout: 2_000,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 4,
					entityIndex: 1,
					properties: { size: "xl" },
					timeout: 2_000,
				}),
			],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(customer.balances?.[TestFeature.Credits]).toMatchObject({
			usage: 58,
		});
	},
	{ timeout: 120_000 },
);
