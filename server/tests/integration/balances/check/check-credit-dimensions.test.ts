/**
 * Contract: check on a feature whose credit rate is dimensioned converts
 * required_balance at the dimension the properties select, falls back to the
 * row's rate without them, and send_event deducts at the same rate.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const dimensionedAction1: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
				large_eu: {
					match: { size: "large", region: "eu" },
					credit_amount: 20,
				},
			},
			multipliers: {
				spot: { match: { lifecycle: "spot" }, factor: 0.5 },
			},
		},
	],
};

const setupDimensionedCredits = async ({
	customerId,
	includedUsage,
}: {
	customerId: string;
	includedUsage: number;
}) => {
	const creditsItem = {
		...items.free({ featureId: TestFeature.Credits, includedUsage }),
		config: { feature_override: dimensionedAction1 },
	};
	const product = products.base({ id: customerId, items: [creditsItem] });

	return initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [product] })],
		actions: [s.attach({ productId: product.id })],
	});
};

test.concurrent(
	`${chalk.yellowBright("check-credit-dimensions: required_balance converts at the dimension the properties select")}`,
	async () => {
		const customerId = "check-credit-dimensions-convert";
		const { autumnV2_3 } = await setupDimensionedCredits({
			customerId,
			includedUsage: 150,
		});

		const largeEu = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 10,
			properties: { size: "large", region: "eu" },
		});
		expect(largeEu).toMatchObject({
			allowed: false,
			required_balance: 200,
			balance: { feature_id: TestFeature.Credits, remaining: 150 },
		});

		const largeSpot = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 10,
			properties: { size: "large", lifecycle: "spot" },
		});
		expect(largeSpot).toMatchObject({ allowed: true, required_balance: 80 });

		const plain = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 10,
		});
		expect(plain).toMatchObject({ allowed: true, required_balance: 10 });
	},
);

test.concurrent(
	`${chalk.yellowBright("check-credit-dimensions: send_event deducts at the selected dimension")}`,
	async () => {
		const customerId = "check-credit-dimensions-send-event";
		const { autumnV1, autumnV2_3 } = await setupDimensionedCredits({
			customerId,
			includedUsage: 1_000,
		});

		const response = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 10,
			properties: { size: "large" },
			send_event: true,
		});
		expect(response).toMatchObject({ allowed: true, required_balance: 160 });

		// The cached view is invalidated asynchronously, so assert the persisted one.
		await timeout(2_000);
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 1_000 - 160,
			usage: 160,
		});
	},
);
