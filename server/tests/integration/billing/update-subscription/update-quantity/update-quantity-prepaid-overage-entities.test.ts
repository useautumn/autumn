import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	BillingMethod,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const initialQuantity = 300;
const increasedQuantity = 500;
const decreasedQuantity = 200;

const buildPerEntityPrepaidOverageProduct = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 10,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumableMessages({
				includedUsage: 0,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

const buildEntityProductPrepaidOverage = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 10,
			}),
			items.consumableMessages({
				includedUsage: 0,
			}),
		],
	});

const expectEntityPrepaidOverage = ({
	entity,
	remaining,
	usage,
	prepaidRemaining,
	usageBasedUsage,
}: {
	entity: ApiEntityV2;
	remaining: number;
	usage: number;
	prepaidRemaining: number;
	usageBasedUsage: number;
}) => {
	const balance = entity.balances[TestFeature.Messages];
	expect(balance.remaining).toBe(remaining);
	expect(balance.usage).toBe(usage);

	const prepaidBucket = balance.breakdown?.find(
		(balanceBreakdown) =>
			balanceBreakdown.price?.billing_method === BillingMethod.Prepaid,
	);
	const usageBasedBucket = balance.breakdown?.find(
		(balanceBreakdown) =>
			balanceBreakdown.price?.billing_method === BillingMethod.UsageBased,
	);

	expect(prepaidBucket).toBeDefined();
	expect(prepaidBucket).toMatchObject({
		remaining: prepaidRemaining,
	});

	expect(usageBasedBucket).toBeDefined();
	expect(usageBasedBucket).toMatchObject({
		remaining: 0,
		usage: usageBasedUsage,
	});
};

test.concurrent(`${chalk.yellowBright("update-quantity-prepaid-overage-entities: per-entity feature increase adjusts both entities")}`, async () => {
	const customerId = "qty-prepaid-overage-per-entity-increase";
	const product = buildPerEntityPrepaidOverageProduct({
		id: "per-entity-prepaid-overage-increase",
	});

	const { autumnV2, autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.track({
				featureId: TestFeature.Messages,
				entityIndex: 0,
				value: 450,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				entityIndex: 1,
				value: 400,
				timeout: 2000,
			}),
		],
	});

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: product.id,
		feature_quantities: [
			{
				feature_id: TestFeature.Messages,
				quantity: increasedQuantity,
			},
		],
		backfill_prepaid_update: true,
	});

	const entity1 = await autumnV2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectEntityPrepaidOverage({
		entity: entity1,
		remaining: 50,
		usage: 450,
		prepaidRemaining: 50,
		usageBasedUsage: 0,
	});
	expectEntityPrepaidOverage({
		entity: entity2,
		remaining: 100,
		usage: 400,
		prepaidRemaining: 100,
		usageBasedUsage: 0,
	});
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 150,
		usage: 850,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("update-quantity-prepaid-overage-entities: per-entity feature decrease adjusts both entities")}`, async () => {
	const customerId = "qty-prepaid-overage-per-entity-decrease";
	const product = buildPerEntityPrepaidOverageProduct({
		id: "per-entity-prepaid-overage-decrease",
	});

	const { autumnV2, autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.track({
				featureId: TestFeature.Messages,
				entityIndex: 0,
				value: 450,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				entityIndex: 1,
				value: 400,
				timeout: 2000,
			}),
		],
	});

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: product.id,
		feature_quantities: [
			{
				feature_id: TestFeature.Messages,
				quantity: decreasedQuantity,
			},
		],
		backfill_prepaid_update: true,
	});

	const entity1 = await autumnV2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectEntityPrepaidOverage({
		entity: entity1,
		remaining: 0,
		usage: 450,
		prepaidRemaining: 0,
		usageBasedUsage: 250,
	});
	expectEntityPrepaidOverage({
		entity: entity2,
		remaining: 0,
		usage: 400,
		prepaidRemaining: 0,
		usageBasedUsage: 200,
	});
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 850,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("update-quantity-prepaid-overage-entities: entity product increase only adjusts targeted entity")}`, async () => {
	const customerId = "qty-prepaid-overage-entity-product-increase";
	const product = buildEntityProductPrepaidOverage({
		id: "entity-product-prepaid-overage-increase",
	});

	const { autumnV2, autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.billing.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.track({
				featureId: TestFeature.Messages,
				entityIndex: 0,
				value: 450,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				entityIndex: 1,
				value: 400,
				timeout: 2000,
			}),
		],
	});

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: product.id,
		feature_quantities: [
			{
				feature_id: TestFeature.Messages,
				quantity: increasedQuantity,
			},
		],
		backfill_prepaid_update: true,
	});

	const entity1 = await autumnV2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);

	expectEntityPrepaidOverage({
		entity: entity1,
		remaining: 50,
		usage: 450,
		prepaidRemaining: 50,
		usageBasedUsage: 0,
	});
	expectEntityPrepaidOverage({
		entity: entity2,
		remaining: 0,
		usage: 400,
		prepaidRemaining: 0,
		usageBasedUsage: 100,
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { subCount: 2 },
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity-prepaid-overage-entities: entity product decrease only adjusts targeted entity")}`, async () => {
	const customerId = "qty-prepaid-overage-entity-product-decrease";
	const product = buildEntityProductPrepaidOverage({
		id: "entity-product-prepaid-overage-decrease",
	});

	const { autumnV2, autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.billing.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.track({
				featureId: TestFeature.Messages,
				entityIndex: 0,
				value: 450,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				entityIndex: 1,
				value: 400,
				timeout: 2000,
			}),
		],
	});

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		entity_id: entities[1].id,
		plan_id: product.id,
		feature_quantities: [
			{
				feature_id: TestFeature.Messages,
				quantity: decreasedQuantity,
			},
		],
		backfill_prepaid_update: true,
	});

	const entity1 = await autumnV2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);

	expectEntityPrepaidOverage({
		entity: entity1,
		remaining: 0,
		usage: 450,
		prepaidRemaining: 0,
		usageBasedUsage: 150,
	});
	expectEntityPrepaidOverage({
		entity: entity2,
		remaining: 0,
		usage: 400,
		prepaidRemaining: 0,
		usageBasedUsage: 200,
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { subCount: 2 },
	});
});
