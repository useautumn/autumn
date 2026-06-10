import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";
import {
	expectCustomerFeatureCachedAndDb,
	expectCustomerSendEventBlocked,
	expectEntityFeatureBalance,
	getActionUnitsForCreditAmount,
} from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";

test.concurrent(`${chalk.yellowBright("track-customer-spend-limit1: lifetime + consumable customer messages cap track overage")}`, async () => {
	const customerProduct = products.base({
		id: "track-customer-lifetime-consumable",
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
		customerId: "track-customer-spend-limit-1",
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
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 1100,
		remaining: 0,
		usage: 1125,
		maxPurchase: 300,
		breakdownLength: 2,
	});

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () =>
			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
				overage_behavior: "reject",
			}),
	});
	await expectCustomerSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		requestFeatureId: TestFeature.Messages,
		requiredBalance: 1,
		customer: {
			granted: 1100,
			remaining: 0,
			usage: 1125,
			maxPurchase: 300,
			breakdownLength: 2,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-customer-spend-limit2: prepaid + consumable customer messages cap track overage")}`, async () => {
	const customerProduct = products.base({
		id: "track-customer-prepaid-consumable",
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

	const prepaidQuantity = 600;
	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-customer-spend-limit-2",
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

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 820,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 800,
		remaining: 0,
		usage: 825,
		breakdownLength: 2,
	});

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () =>
			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
				overage_behavior: "reject",
			}),
	});
	await expectCustomerSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		requestFeatureId: TestFeature.Messages,
		requiredBalance: 1,
		customer: {
			granted: 800,
			remaining: 0,
			usage: 825,
			breakdownLength: 2,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-customer-spend-limit3: prepaid addon + consumable customer messages cap track overage")}`, async () => {
	const consumableProduct = products.base({
		id: "track-customer-consumable",
		items: [
			items.consumableMessages({
				includedUsage: 200,
				price: 0.5,
			}),
		],
	});

	const prepaidAddon = products.base({
		id: "track-customer-prepaid-addon",
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
		customerId: "track-customer-spend-limit-3",
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
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 800,
		remaining: 0,
		usage: 825,
		breakdownLength: 2,
	});

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () =>
			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
				overage_behavior: "reject",
			}),
	});
	await expectCustomerSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		requestFeatureId: TestFeature.Messages,
		requiredBalance: 1,
		customer: {
			granted: 800,
			remaining: 0,
			usage: 825,
			breakdownLength: 2,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-customer-spend-limit5: customer spend limit is enforced on aggregate per-entity balances")}`, async () => {
	const perEntityProduct = products.base({
		id: "track-customer-per-entity-product",
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
		customerId: "track-customer-spend-limit-5",
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

	await timeout(2000);

	for (const entity of entities) {
		await autumnV2_1.entities.get(customerId, entity.id); // initialize cache.
	}

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
	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 800,
		remaining: 0,
		usage: 810,
		breakdownLength: 2,
	});
	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[1].id,
		featureId: TestFeature.Messages,
		granted: 800,
		remaining: 0,
		usage: 810,
		breakdownLength: 2,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 1600,
		remaining: 0,
		usage: 1625,
		breakdownLength: 2,
	});

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () =>
			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
				overage_behavior: "reject",
			}),
	});
	await expectCustomerSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		requestFeatureId: TestFeature.Messages,
		requiredBalance: 1,
		customer: {
			granted: 1600,
			remaining: 0,
			usage: 1625,
			breakdownLength: 2,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-customer-spend-limit6: credit-system customer tracking uses converted credits and caps overage")}`, async () => {
	const includedCredits = 100;
	const spendLimitCredits = 25;
	const existingOverageCredits = 20;

	const customerProduct = products.base({
		id: "track-customer-credits",
		items: [
			items.consumable({
				featureId: TestFeature.Credits,
				includedUsage: includedCredits,
				maxPurchase: 300,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId, ctx } = await initScenario({
		customerId: "track-customer-spend-limit-6",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [customerProduct] }),
		],
		actions: [s.billing.attach({ productId: customerProduct.id })],
	});

	const creditsFeature = ctx.features.find(
		(feature) => feature.id === TestFeature.Credits,
	)!;
	const action1CreditCost = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditsFeature,
		amount: 1,
	});
	const firstTrackValue = getActionUnitsForCreditAmount({
		creditAmount: includedCredits + existingOverageCredits,
		creditCostPerActionUnit: action1CreditCost,
	});
	const secondTrackValue = getActionUnitsForCreditAmount({
		creditAmount: spendLimitCredits - existingOverageCredits + 5,
		creditCostPerActionUnit: action1CreditCost,
	});

	await setCustomerSpendLimit({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Credits,
		overageLimit: spendLimitCredits,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: firstTrackValue,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: secondTrackValue,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Credits,
		granted: includedCredits,
		remaining: 0,
		usage: includedCredits + spendLimitCredits,
		maxPurchase: 300,
		breakdownLength: 1,
	});

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () =>
			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 1 / action1CreditCost,
				overage_behavior: "reject",
			}),
	});
	await expectCustomerSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		requestFeatureId: TestFeature.Action1,
		requiredBalance: 1 / action1CreditCost,
		expectedFeatureId: TestFeature.Credits,
		expectedResponseRequiredBalance: 1,
		customer: {
			granted: includedCredits,
			remaining: 0,
			usage: includedCredits + spendLimitCredits,
			maxPurchase: 300,
			breakdownLength: 1,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-customer-spend-limit7: disabled customer spend limit no longer caps rejecting track")}`, async () => {
	const customerProduct = products.base({
		id: "track-customer-disabled-limit",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "track-customer-spend-limit-7",
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

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
		overage_behavior: "reject",
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 130,
		breakdownLength: 1,
	});
});

test.concurrent(`${chalk.yellowBright("track-customer-spend-limit8: disabled customer spend limit no longer caps aggregate entity-product track across entities")}`, async () => {
	const entityProduct = products.base({
		id: "track-customer-disabled-entity-product",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-customer-spend-limit-8",
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

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 10,
		overage_behavior: "reject",
	});

	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 120,
		breakdownLength: 1,
	});
	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[1].id,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 110,
		breakdownLength: 1,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 200,
		remaining: 0,
		usage: 230,
		breakdownLength: 2,
	});

	// expect(
	// 	(
	// 		await autumnV2_1.check({
	// 			customer_id: customerId,
	// 			feature_id: TestFeature.Messages,
	// 			required_balance: 10,
	// 		})
	// 	).allowed,
	// ).toBe(true);
});
