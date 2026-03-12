import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import {
	expectCustomerFeatureCachedAndDb,
	expectEntityFeatureCachedAndDb,
	getActionUnitsForCreditAmount,
	setEntitySpendLimit,
} from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";

test.concurrent(`${chalk.yellowBright("track-postgres-entity-spend-limit1: per-entity messages cap overage across Redis then Postgres track paths")}`, async () => {
	const perEntityProduct = products.base({
		id: "track-postgres-per-entity-messages",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				maxPurchase: 300,
				price: 0.5,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const { autumnV2, autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-postgres-entity-spend-limit-1",
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

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 120,
		},
		{ skipCache: true },
	);

	await timeout(4000);

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 10,
		},
		{ skipCache: true },
	);

	await expectEntityFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 125,
		maxPurchase: 300,
		breakdownLength: 1,
	});

	await expectCustomerFeatureCachedAndDb({
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
			await autumnV2.track(
				{
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				},
				{ skipCache: true },
			),
	});
});

test.concurrent(`${chalk.yellowBright("track-postgres-entity-spend-limit2: entity-product messages cap overage across Redis then Postgres track paths")}`, async () => {
	const entityProduct = products.base({
		id: "track-postgres-entity-product-messages",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				maxPurchase: 300,
				price: 0.5,
			}),
		],
	});

	const { autumnV2, autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-postgres-entity-spend-limit-2",
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

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 120,
		},
		{ skipCache: true },
	);

	await timeout(4000);

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 10,
		},
		{ skipCache: true },
	);

	await expectEntityFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 125,
		maxPurchase: 300,
		breakdownLength: 1,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 0,
		usage: 125,
		maxPurchase: 300,
		breakdownLength: 1,
	});
});

test.concurrent(`${chalk.yellowBright("track-postgres-entity-spend-limit3: credit-system overage stays capped when Postgres handles the second track")}`, async () => {
	const includedCredits = 100;
	const spendLimitCredits = 25;
	const existingOverageCredits = 20;
	const perEntityProduct = products.base({
		id: "track-postgres-per-entity-credits",
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

	const { autumnV2, autumnV2_1, customerId, entities, ctx } =
		await initScenario({
			customerId: "track-postgres-entity-spend-limit-3",
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

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			value: firstTrackValue,
		},
		{ skipCache: true },
	);

	await timeout(4000);

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			value: secondTrackValue,
		},
		{ skipCache: true },
	);

	await expectEntityFeatureCachedAndDb({
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
});

test.concurrent(`${chalk.yellowBright("track-postgres-entity-spend-limit4: prepaid + consumable credits stay capped when Postgres handles the second track")}`, async () => {
	const prepaidQuantity = 600;
	const consumableIncludedCredits = 200;
	const spendLimitCredits = 25;
	const existingOverageCredits = 20;
	const totalGrantedCredits = prepaidQuantity + consumableIncludedCredits;

	const perEntityProduct = products.base({
		id: "track-postgres-per-entity-prepaid-consumable-credits",
		items: [
			items.prepaid({
				featureId: TestFeature.Credits,
				includedUsage: 100,
				billingUnits: 100,
				price: 8.5,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumable({
				featureId: TestFeature.Credits,
				includedUsage: consumableIncludedCredits,
				price: 0.5,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const { autumnV2, autumnV2_1, customerId, entities, ctx } =
		await initScenario({
			customerId: "track-postgres-entity-spend-limit-4",
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
							feature_id: TestFeature.Credits,
							quantity: prepaidQuantity,
						},
					],
				}),
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
		creditAmount: totalGrantedCredits + existingOverageCredits,
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

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			value: firstTrackValue,
		},
		{ skipCache: true },
	);

	await timeout(4000);

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			value: secondTrackValue,
		},
		{ skipCache: true },
	);

	await expectEntityFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Credits,
		granted: totalGrantedCredits,
		remaining: 0,
		usage: totalGrantedCredits + spendLimitCredits,
		breakdownLength: 2,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Credits,
		granted: totalGrantedCredits,
		remaining: 0,
		usage: totalGrantedCredits + spendLimitCredits,
		breakdownLength: 2,
	});

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () =>
			await autumnV2.track(
				{
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Action1,
					value: 1 / action1CreditCost,
					overage_behavior: "reject",
				},
				{ skipCache: true },
			),
	});
});

test.concurrent(`${chalk.yellowBright("track-postgres-entity-spend-limit5: concurrent entity-product messages respect spend limit in Postgres path")}`, async () => {
	const entityProduct = products.base({
		id: "track-postgres-entity-product-concurrency",
		items: [
			items.consumableMessages({
				includedUsage: 5,
				price: 0.1,
			}),
		],
	});

	const { autumnV2, autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-postgres-entity-spend-limit-5",
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
			autumnV2.track(
				{
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 3,
					overage_behavior: "reject",
				},
				{ skipCache: true },
			),
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

	await expectEntityFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 5,
		remaining: 0,
		usage: 9,
		breakdownLength: 1,
	});

	await expectCustomerFeatureCachedAndDb({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		granted: 5,
		remaining: 0,
		usage: 9,
		breakdownLength: 1,
	});
});
