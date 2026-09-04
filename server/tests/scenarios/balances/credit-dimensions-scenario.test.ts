import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(
	`${chalk.yellowBright("scenario: dimensioned credit rate card")}`,
	async () => {
		const customerId = "credit-dimensions-dashboard";
		const product = products.base({
			id: "credit-dimensions-pro",
			items: [
				items.consumable({
					featureId: TestFeature.DimensionCredits,
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

		const trackOne = (properties: Record<string, string>) =>
			autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.DimensionAction,
				value: 1,
				properties,
			});

		await trackOne({ size: "small" });
		await trackOne({ size: "large" });
		await trackOne({ size: "large", region: "eu" });
		await trackOne({ size: "large", lifecycle: "spot" });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		console.log("credit dimensions scenario:", {
			customerId,
			creditSystemId: TestFeature.DimensionCredits,
			sourceFeatureId: TestFeature.DimensionAction,
			rateCard: {
				fallback: "1 credit",
				size_large: "16 credits",
				size_large_region_eu: "20 credits",
				size_xl: "graduated 2 → 1 after 5 units",
				lifecycle_spot: "× 0.3",
			},
			tracked:
				"small=1 + large=16 + large/eu=20 + large/spot=4.8 = 41.8 credits",
			creditBalance: customer.features[TestFeature.DimensionCredits]?.balance,
		});
	},
	{ timeout: 120_000 },
);
