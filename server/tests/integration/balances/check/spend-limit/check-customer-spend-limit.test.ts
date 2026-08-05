/** Customer spend-limit check tests (slice 1 of 2). */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectBoundaryAndParity } from "../../utils/spend-limit-utils/checkSpendLimitUtils.js";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";

test.concurrent(
	`${chalk.yellowBright("check-customer-spend-limit1: lifetime + consumable customer messages respect spend limit and cache parity")}`,
	async () => {
		const customerProduct = products.base({
			id: "customer-lifetime-consumable",
			items: [
				items.lifetimeMessages({
					includedUsage: 1000,
				}),
				items.consumableMessages({
					includedUsage: 100,
					maxPurchase: 300,
					price: 0.5,
				}),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "check-customer-spend-limit-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 25,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1120,
		});

		await expectBoundaryAndParity({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			allowedRequiredBalance: 5,
			blockedRequiredBalance: 6,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("check-customer-spend-limit2: prepaid + consumable customer messages respect spend limit and cache parity")}`,
	async () => {
		const customerProduct = products.base({
			id: "customer-prepaid-consumable",
			items: [
				items.prepaidMessages({
					includedUsage: 100,
					billingUnits: 100,
					price: 8.5,
				}),
				items.consumableMessages({
					includedUsage: 200,
					maxPurchase: 300,
					price: 0.5,
				}),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "check-customer-spend-limit-2",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [
				s.billing.attach({
					productId: customerProduct.id,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: 600,
						},
					],
				}),
			],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 25,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 820,
		});

		await expectBoundaryAndParity({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			allowedRequiredBalance: 5,
			blockedRequiredBalance: 6,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("check-customer-spend-limit3: prepaid addon + consumable customer messages respect spend limit and cache parity")}`,
	async () => {
		const consumableProduct = products.base({
			id: "customer-consumable",
			items: [
				items.consumableMessages({
					includedUsage: 200,
					maxPurchase: 300,
					price: 0.5,
				}),
			],
		});

		const prepaidAddon = products.base({
			id: "customer-prepaid-addon",
			isAddOn: true,
			items: [
				items.prepaidMessages({
					includedUsage: 100,
					billingUnits: 100,
					price: 8.5,
				}),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "check-customer-spend-limit-3",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [consumableProduct, prepaidAddon] }),
			],
			actions: [
				s.billing.attach({ productId: consumableProduct.id }),
				s.billing.attach({
					productId: prepaidAddon.id,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: 600,
						},
					],
				}),
			],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 25,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 820,
		});

		await expectBoundaryAndParity({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			allowedRequiredBalance: 5,
			blockedRequiredBalance: 6,
		});
	},
);
