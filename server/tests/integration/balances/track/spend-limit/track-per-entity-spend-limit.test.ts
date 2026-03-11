import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import {
	expectCustomerFeatureBalance,
	expectEntityFeatureBalance,
	expectSendEventBlocked,
	getActionUnitsForCreditAmount,
	setEntitySpendLimit,
} from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";

test.concurrent(`${chalk.yellowBright("track-per-entity-spend-limit1: lifetime + consumable per-entity messages cap track overage")}`, async () => {
	const perEntityProduct = products.base({
		id: "track-per-entity-lifetime-consumable",
		items: [
			items.lifetimeMessages({
				includedUsage: 1000,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumableMessages({
				includedUsage: 100,
				maxPurchase: 300,
				price: 0.5,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-per-entity-spend-limit-1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: perEntityProduct.id })],
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

test.concurrent(`${chalk.yellowBright("track-per-entity-spend-limit2: prepaid + consumable per-entity messages cap track overage")}`, async () => {
	const perEntityProduct = products.base({
		id: "track-per-entity-prepaid-consumable",
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

	const totalQuantity = 600;
	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-per-entity-spend-limit-2",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: perEntityProduct.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: totalQuantity,
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
		value: totalQuantity + 220,
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
		granted: totalQuantity + 200,
		remaining: 0,
		usage: totalQuantity + 225,
		breakdownLength: 2,
	});

	await expectCustomerFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: totalQuantity + 200,
		remaining: 0,
		usage: totalQuantity + 225,

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
			granted: totalQuantity + 200,
			remaining: 0,
			usage: totalQuantity + 225,
			breakdownLength: 2,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-per-entity-spend-limit3: different per-entity spend limits stay isolated while customer balance aggregates")}`, async () => {
	const perEntityProduct = products.base({
		id: "track-per-entity-two-entities",
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
		customerId: "track-per-entity-spend-limit-3",
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
		breakdownLength: 2,
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
			breakdownLength: 2,
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
			breakdownLength: 2,
		},
	});
});

test.concurrent(`${chalk.yellowBright("track-per-entity-spend-limit4: allocated workflows per entity cap track overage")}`, async () => {
	const workflowItem = {
		...constructArrearProratedItem({
			featureId: TestFeature.Workflows,
			pricePerUnit: 10,
			includedUsage: 1,
		}),
		entity_feature_id: TestFeature.Users,
	};

	const perEntityProduct = products.base({
		id: "track-per-entity-workflows",
		items: [workflowItem],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-per-entity-spend-limit-4",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: perEntityProduct.id })],
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

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () =>
			await autumnV2_1.track({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Workflows,
				value: 1,
				overage_behavior: "reject",
			}),
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

test.concurrent(`${chalk.yellowBright("track-per-entity-spend-limit5: credit-system per-entity tracking uses converted credits and caps overage")}`, async () => {
	const includedCredits = 100;
	const spendLimitCredits = 25;
	const existingOverageCredits = 20;

	const perEntityProduct = products.base({
		id: "track-per-entity-credits",
		items: [
			items.consumable({
				featureId: TestFeature.Credits,
				includedUsage: includedCredits,
				maxPurchase: 300,
				price: 0.5,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const { autumnV2_1, customerId, entities, ctx } = await initScenario({
		customerId: "track-per-entity-spend-limit-5",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: perEntityProduct.id })],
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
