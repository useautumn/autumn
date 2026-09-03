import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(
	`${chalk.yellowBright("scenario: graduated credit rate card")}`,
	async () => {
		const customerId = "credit-rate-card-dashboard";
		const product = products.base({
			id: "credit-rate-card-pro",
			items: [
				items.consumable({
					featureId: TestFeature.TieredCredits,
					includedUsage: 1_000,
					price: 1,
					billingUnits: 1,
				}),
			],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 9_950,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 20_050,
		});

		const nextHundredUnits = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			required_balance: 100,
		});
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		console.log("credit rate card scenario:", {
			customerId,
			creditSystemId: TestFeature.TieredCredits,
			sourceFeatureId: TestFeature.TieredAction,
			rateCard:
				"100 units/billing group; tiers: ≤10k @ 1 credit, ≤50k @ 0.8, ∞ @ 0.5",
			tracked: "30,000 units → 10,000 @ 1 + 20,000 @ 0.8 = 260 credits",
			creditBalance: customer.features[TestFeature.TieredCredits].balance,
			nextHundredUnitsCost: nextHundredUnits.required_balance,
		});
	},
	{ timeout: 120_000 },
);
