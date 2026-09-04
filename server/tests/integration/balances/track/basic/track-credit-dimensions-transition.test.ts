/**
 * Contract: per-dimension usage survives a plan transition. Attribution is keyed
 * `<feature>::<dimension>`, so an upgrade that carries consumable usage must
 * carry every dimension's position — not merge them, and not lose one.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5, FeatureConfigOverride } from "@autumn/shared";
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
				xl: { match: { size: "xl" }, credit_amount: 20 },
			},
		},
	],
};

const creditItem = (includedUsage: number) => {
	const item = items.consumable({
		featureId: TestFeature.Credits,
		includedUsage,
	});
	return {
		...item,
		config: { ...item.config, feature_override: dimensionedAction1 },
	};
};

test.concurrent(
	`${chalk.yellowBright("track-credit-dimensions-transition: usage in several dimensions carries across an upgrade")}`,
	async () => {
		const customerId = "dimensions-transition";
		const starter = products.base({
			id: "dimensions-transition-starter",
			items: [creditItem(GRANT)],
		});
		const upgraded = products.pro({
			id: "dimensions-transition-pro",
			items: [creditItem(GRANT * 2)],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [starter, upgraded] }),
			],
			actions: [
				s.billing.attach({ productId: starter.id }),
				// Two dimensions, so the carry has more than one attribution key.
				s.track({
					featureId: TestFeature.Action1,
					value: 2,
					properties: { size: "large" },
					timeout: 2_000,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 1,
					properties: { size: "xl" },
					timeout: 2_000,
				}),
			],
		});

		// 2 x 16 + 1 x 20 = 52 consumed before the upgrade.
		const before = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(before.balances?.[TestFeature.Credits]).toMatchObject({
			usage: 52,
		});

		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: upgraded.id,
			carry_over_usages: {
				enabled: true,
				feature_ids: [TestFeature.Credits],
			},
		});

		// carry_over_usages moves both dimension positions onto the new plan.
		const after = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(after.balances?.[TestFeature.Credits]).toMatchObject({
			usage: 52,
			remaining: GRANT * 2 - 52,
		});

		// Pricing still resolves per dimension on the new plan.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
			properties: { size: "xl" },
		});
		await new Promise((resolve) => setTimeout(resolve, 2_000));

		const afterTrack = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(afterTrack.balances?.[TestFeature.Credits]).toMatchObject({
			usage: 72,
		});
	},
);
