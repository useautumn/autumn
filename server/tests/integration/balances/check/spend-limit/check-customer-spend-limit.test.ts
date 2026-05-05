import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	expectBoundaryAndParity,
	normalizeCheckResponse,
} from "../../utils/spend-limit-utils/checkSpendLimitUtils.js";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";
import { warmEntityCaches } from "../../utils/warmEntityCaches.js";

const expectAllowedCheckParity = async ({
	autumn,
	customerId,
	featureId,
	requiredBalance,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_1"];
	customerId: string;
	featureId: string;
	requiredBalance: number;
}) => {
	const cached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: featureId,
		required_balance: requiredBalance,
	});

	expect(cached.allowed).toBe(true);

	await timeout(4000);

	const uncached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: featureId,
		required_balance: requiredBalance,
		skip_cache: true,
	});

	expect(normalizeCheckResponse(uncached)).toEqual(
		normalizeCheckResponse(cached),
	);
};

test.concurrent(`${chalk.yellowBright("check-customer-spend-limit1: lifetime + consumable customer messages respect spend limit and cache parity")}`, async () => {
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
});

test.concurrent(`${chalk.yellowBright("check-customer-spend-limit2: prepaid + consumable customer messages respect spend limit and cache parity")}`, async () => {
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
});

test.concurrent(`${chalk.yellowBright("check-customer-spend-limit3: prepaid addon + consumable customer messages respect spend limit and cache parity")}`, async () => {
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
});

test.skip(`${chalk.yellowBright("check-customer-spend-limit4: customer spend limit applies when customer inherits entity product balances")}`, async () => {
	const entityProduct = products.base({
		id: "customer-entity-product",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 8.5,
			}),
			items.consumableMessages({
				includedUsage: 200,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-customer-spend-limit-4",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: entityProduct.id,
				entityIndex: 0,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: 600,
					},
				],
			}),
			s.billing.attach({
				productId: entityProduct.id,
				entityIndex: 1,
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

	await warmEntityCaches({ autumn: autumnV2_1, customerId, entities });

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 810,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 810,
	});

	await expectBoundaryAndParity({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		allowedRequiredBalance: 5,
		blockedRequiredBalance: 6,
	});
});

test.concurrent(`${chalk.yellowBright("check-customer-spend-limit5: customer spend limit applies when customer inherits per-entity balances")}`, async () => {
	const perEntityProduct = products.base({
		id: "customer-per-entity-product",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 8.5,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumableMessages({
				includedUsage: 200,
				price: 0.5,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-customer-spend-limit-5",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: perEntityProduct.id,
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

	await warmEntityCaches({ autumn: autumnV2_1, customerId, entities });

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 810,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 810,
	});
	// return;

	await expectBoundaryAndParity({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		allowedRequiredBalance: 5,
		blockedRequiredBalance: 6,
	});
});

test.concurrent(`${chalk.yellowBright("check-customer-spend-limit6: disabled customer spend limit no longer caps direct customer checks")}`, async () => {
	const customerProduct = products.base({
		id: "customer-disabled-limit",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-customer-spend-limit-6",
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
		value: 120,
	});

	await setCustomerSpendLimit({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		overageLimit: 25,
		enabled: false,
	});

	await expectAllowedCheckParity({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		requiredBalance: 50,
	});
});

// Not relevant with new Redis cache
test.skip(`${chalk.yellowBright("check-customer-spend-limit7: disabled customer spend limit no longer caps inherited entity-product checks across entities")}`, async () => {
	const entityProduct = products.base({
		id: "customer-disabled-entity-product",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-customer-spend-limit-7",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: entityProduct.id, entityIndex: 0 }),
			s.billing.attach({ productId: entityProduct.id, entityIndex: 1 }),
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
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 110,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 110,
	});

	await setCustomerSpendLimit({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		overageLimit: 25,
		enabled: false,
	});

	await expectAllowedCheckParity({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		requiredBalance: 50,
	});
});

test.concurrent(`${chalk.yellowBright("check-customer-spend-limit8: disabled customer spend limit no longer caps inherited per-entity checks across entities")}`, async () => {
	const perEntityProduct = products.base({
		id: "customer-disabled-per-entity-product",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 8.5,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumableMessages({
				includedUsage: 200,
				price: 0.5,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const prepaidQuantity = 600;
	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-customer-spend-limit-8",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: perEntityProduct.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: prepaidQuantity,
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

	await warmEntityCaches({ autumn: autumnV2_1, customerId, entities });

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 810,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 810,
	});

	await setCustomerSpendLimit({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		overageLimit: 25,
		enabled: false,
	});

	await expectAllowedCheckParity({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		requiredBalance: 50,
	});
});
