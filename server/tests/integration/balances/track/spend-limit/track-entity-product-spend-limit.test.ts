import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";
import {
	expectCustomerFeatureBalance,
	expectEntityFeatureBalance,
	expectSendEventBlocked,
	getActionUnitsForCreditAmount,
	setEntitySpendLimit,
} from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";

test.concurrent(`${chalk.yellowBright("track-entity-product-spend-limit1: lifetime + consumable entity product caps overage and keeps entity/customer balances aligned")}`, async () => {
	const entityProduct = products.base({
		id: "track-entity-product-lifetime-consumable",
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

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-product-spend-limit-1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: entityProduct.id, entityIndex: 0 }),
		],
	});

	await setEntitySpendLimit({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		overageLimit: 25,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 1120,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 1100,
		remaining: 0,
		usage: 1125,
		maxPurchase: 300,
		breakdownLength: 2,
	});

	await expectCustomerFeatureBalance({
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
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: 1,
				overage_behavior: "reject",
			}),
	});
	await expectSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		requestFeatureId: TestFeature.Messages,
		requiredBalance: 1,
		entity: {
			granted: 1100,
			remaining: 0,
			usage: 1125,
			maxPurchase: 300,
			breakdownLength: 2,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-product-spend-limit2: prepaid + consumable entity product caps overage")}`, async () => {
	const entityProduct = products.base({
		id: "track-entity-product-prepaid-consumable",
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
	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-product-spend-limit-2",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: entityProduct.id,
				entityIndex: 0,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: prepaidQuantity,
					},
				],
			}),
		],
	});

	await setEntitySpendLimit({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		overageLimit: 25,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 820,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 800,
		remaining: 0,
		usage: 825,
		breakdownLength: 2,
	});

	await expectCustomerFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 800,
		remaining: 0,
		usage: 825,
		// breakdownLength: 2,
	});
	await expectSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		requestFeatureId: TestFeature.Messages,
		requiredBalance: 1,
		entity: {
			granted: 800,
			remaining: 0,
			usage: 825,
			breakdownLength: 2,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-product-spend-limit3: two entity products with different spend limits stay isolated and roll up to customer totals")}`, async () => {
	const entityProduct = products.base({
		id: "track-entity-product-two-entities",
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
	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-product-spend-limit-3",
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
						quantity: prepaidQuantity,
					},
				],
			}),
			s.billing.attach({
				productId: entityProduct.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: prepaidQuantity,
					},
				],
			}),
		],
	});

	await setEntitySpendLimit({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		overageLimit: 25,
	});
	await setEntitySpendLimit({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[1].id,
		featureId: TestFeature.Messages,
		overageLimit: 40,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 820,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 10,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 820,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 25,
	});

	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 800,
		remaining: 0,
		usage: 825,
		breakdownLength: 2,
	});
	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[1].id,
		featureId: TestFeature.Messages,
		granted: 800,
		remaining: 0,
		usage: 840,
		breakdownLength: 2,
	});

	await expectCustomerFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 1600,
		remaining: 0,
		usage: 1665,
		// breakdownLength: 4,
	});
	await expectSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		requestFeatureId: TestFeature.Messages,
		requiredBalance: 1,
		entity: {
			granted: 800,
			remaining: 0,
			usage: 825,
			breakdownLength: 2,
		},
		customer: {
			granted: 1600,
			remaining: 0,
			usage: 1665,
			breakdownLength: 4,
		},
	});
	await expectSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[1].id,
		requestFeatureId: TestFeature.Messages,
		requiredBalance: 1,
		entity: {
			granted: 800,
			remaining: 0,
			usage: 840,
			breakdownLength: 2,
		},
		customer: {
			granted: 1600,
			remaining: 0,
			usage: 1665,
			breakdownLength: 4,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-product-spend-limit4: allocated workflows entity product caps overage")}`, async () => {
	const entityProduct = products.base({
		id: "track-entity-product-workflows",
		items: [items.allocatedWorkflows({ includedUsage: 1 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-product-spend-limit-4",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: entityProduct.id, entityIndex: 0 }),
		],
	});

	await setEntitySpendLimit({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Workflows,
		overageLimit: 2,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Workflows,
		value: 1,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Workflows,
		value: 2,
	});

	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Workflows,
		granted: 1,
		remaining: 0,
		usage: 3,
		breakdownLength: 1,
	});
	await expectSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		requestFeatureId: TestFeature.Workflows,
		requiredBalance: 1,
		entity: {
			granted: 1,
			remaining: 0,
			usage: 3,
			breakdownLength: 1,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-product-spend-limit5: credit-system entity product uses converted credits and caps overage")}`, async () => {
	const includedCredits = 100;
	const spendLimitCredits = 25;
	const existingOverageCredits = 20;

	const entityProduct = products.base({
		id: "track-entity-product-credits",
		items: [
			items.consumable({
				featureId: TestFeature.Credits,
				includedUsage: includedCredits,
				maxPurchase: 300,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId, entities, ctx } = await initScenario({
		customerId: "track-entity-product-spend-limit-5",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: entityProduct.id, entityIndex: 0 }),
		],
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

	await setEntitySpendLimit({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Credits,
		overageLimit: spendLimitCredits,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Action1,
		value: firstTrackValue,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Action1,
		value: secondTrackValue,
	});

	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Credits,
		granted: includedCredits,
		remaining: 0,
		usage: includedCredits + spendLimitCredits,
		maxPurchase: 300,
		breakdownLength: 1,
	});

	await expectCustomerFeatureBalance({
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
				entity_id: entities[0].id,
				feature_id: TestFeature.Action1,
				value: 1 / action1CreditCost,
				overage_behavior: "reject",
			}),
	});
	await expectSendEventBlocked({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		requestFeatureId: TestFeature.Action1,
		requiredBalance: 1 / action1CreditCost,
		expectedFeatureId: TestFeature.Credits,
		expectedResponseRequiredBalance: 1,
		entity: {
			granted: includedCredits,
			remaining: 0,
			usage: includedCredits + spendLimitCredits,
			maxPurchase: 300,
			breakdownLength: 1,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-product-spend-limit6: concurrent entity consumable tracking respects spend limit and keeps cache/db aligned")}`, async () => {
	const entityProduct = products.base({
		id: "track-entity-product-concurrency",
		items: [
			items.consumableMessages({
				includedUsage: 5,
				price: 0.1,
			}),
		],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-product-spend-limit-6",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: entityProduct.id, entityIndex: 0 }),
		],
	});

	await setEntitySpendLimit({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		overageLimit: 5,
	});

	const results = await Promise.allSettled(
		Array.from({ length: 5 }, () =>
			autumnV2_1.track({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: 3,
				overage_behavior: "reject",
			}),
		),
	);

	const successCount = results.filter(
		(result) => result.status === "fulfilled",
	).length;
	const rejectedCount = results.filter(
		(result) => result.status === "rejected",
	).length;

	expect(successCount).toBe(3);
	expect(rejectedCount).toBe(2);

	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 5,
		remaining: 0,
		usage: 9,
		breakdownLength: 1,
	});
	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 5,
		remaining: 0,
		usage: 9,
		breakdownLength: 1,
		skipCache: true,
	});

	await expectCustomerFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 5,
		remaining: 0,
		usage: 9,
		breakdownLength: 1,
	});
	await expectCustomerFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 5,
		remaining: 0,
		usage: 9,
		breakdownLength: 1,
		skipCache: true,
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-product-spend-limit7: disabled spend limit no longer caps entity product track")}`, async () => {
	const entityProduct = products.base({
		id: "track-entity-product-disabled-limit",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-product-spend-limit-7",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: entityProduct.id, entityIndex: 0 }),
		],
	});

	await setEntitySpendLimit({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		overageLimit: 25,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 120,
	});

	await setEntitySpendLimit({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
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
		usage: 130,
		breakdownLength: 1,
	});
	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 130,
		breakdownLength: 1,
		skipCache: true,
	});

	await expectCustomerFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 130,
		breakdownLength: 1,
	});
	await expectCustomerFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 130,
		breakdownLength: 1,
		skipCache: true,
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-product-spend-limit8: entity-scoped track inherits customer spend_limit when entity has none")}`, async () => {
	const customerProduct = products.base({
		id: "inherit-customer-spend-limit-track",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				maxPurchase: 300,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-product-spend-limit-8",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [customerProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
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
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 120,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await expectCustomerFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 125,
		maxPurchase: 300,
		breakdownLength: 1,
	});

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () =>
			await autumnV2_1.track({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: 1,
				overage_behavior: "reject",
			}),
	});
});
