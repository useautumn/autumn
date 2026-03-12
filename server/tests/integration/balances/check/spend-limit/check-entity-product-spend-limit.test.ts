import { expect, test } from "bun:test";
import type { CheckResponseV3, EntityBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils";

type AutumnV2_1Client = Awaited<ReturnType<typeof initScenario>>["autumnV2_1"];

const normalizeCheckResponse = (response: CheckResponseV3) => ({
	allowed: response.allowed,
	customer_id: response.customer_id,
	entity_id: response.entity_id ?? null,
	required_balance: response.required_balance ?? null,
	balance: response.balance
		? {
				feature_id: response.balance.feature_id,
				granted: response.balance.granted,
				remaining: response.balance.remaining,
				usage: response.balance.usage,
				unlimited: response.balance.unlimited,
				overage_allowed: response.balance.overage_allowed,
				max_purchase: response.balance.max_purchase,
				breakdown:
					response.balance.breakdown?.map((item) => ({
						plan_id: item.plan_id,
						included_grant: item.included_grant,
						prepaid_grant: item.prepaid_grant,
						remaining: item.remaining,
						usage: item.usage,
						unlimited: item.unlimited,
						billing_method: item.price?.billing_method ?? null,
						max_purchase: item.price?.max_purchase ?? null,
						reset_interval: item.reset?.interval ?? null,
					})) ?? [],
			}
		: null,
});

const setEntitySpendLimit = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	overageLimit,
	enabled = true,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	entityId: string;
	featureId: string;
	overageLimit: number;
	enabled?: boolean;
}) => {
	const billingControls: EntityBillingControls = {
		spend_limits: [
			{
				feature_id: featureId,
				enabled,
				overage_limit: overageLimit,
			},
		],
	};

	await autumn.entities.update(customerId, entityId, {
		billing_controls: billingControls,
	});
};

const getActionUnitsForCreditAmount = ({
	creditAmount,
	creditCostPerActionUnit,
}: {
	creditAmount: number;
	creditCostPerActionUnit: number;
}) => creditAmount / creditCostPerActionUnit;

const expectBoundaryAndParity = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	allowedRequiredBalance,
	blockedRequiredBalance,
	expectedFeatureId = featureId,
	expectedAllowedResponseRequiredBalance = allowedRequiredBalance,
	expectedBlockedResponseRequiredBalance = blockedRequiredBalance,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	entityId: string;
	featureId: string;
	allowedRequiredBalance: number;
	blockedRequiredBalance: number;
	expectedFeatureId?: string;
	expectedAllowedResponseRequiredBalance?: number;
	expectedBlockedResponseRequiredBalance?: number;
}) => {
	const allowedCached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: featureId,
		required_balance: allowedRequiredBalance,
	});

	const blockedCached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: featureId,
		required_balance: blockedRequiredBalance,
	});

	expect(allowedCached.allowed).toBe(true);
	expect(blockedCached.allowed).toBe(false);
	expect(allowedCached.balance?.feature_id).toBe(expectedFeatureId);
	expect(blockedCached.balance?.feature_id).toBe(expectedFeatureId);
	expect(allowedCached.required_balance).toBe(
		expectedAllowedResponseRequiredBalance,
	);
	expect(blockedCached.required_balance).toBe(
		expectedBlockedResponseRequiredBalance,
	);

	await timeout(4000);

	const allowedUncached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: featureId,
		required_balance: allowedRequiredBalance,
		skip_cache: true,
	});

	const blockedUncached = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: featureId,
		required_balance: blockedRequiredBalance,
		skip_cache: true,
	});

	expect(normalizeCheckResponse(allowedUncached)).toEqual(
		normalizeCheckResponse(allowedCached),
	);
	expect(normalizeCheckResponse(blockedUncached)).toEqual(
		normalizeCheckResponse(blockedCached),
	);
};

test.concurrent(`${chalk.yellowBright("check-entity-product-spend-limit1: lifetime + consumable entity product respects spend limit and cache parity")}`, async () => {
	const entityProduct = products.base({
		id: "entity-product-lifetime-consumable",
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
		customerId: "check-entity-product-spend-limit-1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
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

	await expectBoundaryAndParity({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		allowedRequiredBalance: 5,
		blockedRequiredBalance: 6,
	});
});

test.concurrent(`${chalk.yellowBright("check-entity-product-spend-limit2: prepaid + consumable entity product respects spend limit and cache parity")}`, async () => {
	const entityProduct = products.base({
		id: "entity-product-prepaid-consumable",
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

	const prepaidQuantity = 500;
	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-entity-product-spend-limit-2",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
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

	await expectBoundaryAndParity({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		allowedRequiredBalance: 5,
		blockedRequiredBalance: 6,
	});
});

test.concurrent(`${chalk.yellowBright("check-entity-product-spend-limit3: two entities with different spend limits stay isolated and match skip_cache")}`, async () => {
	const entityProduct = products.base({
		id: "entity-product-two-entities",
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

	const prepaidQuantity = 500;
	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-entity-product-spend-limit-3",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: entityProduct.id,
				entityIndex: 0,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: prepaidQuantity,
					},
				],
			}),
			s.attach({
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
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 820,
	});

	const entity1AllowedCached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 5,
	});
	const entity1BlockedCached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 6,
	});
	const entity2AllowedCached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		required_balance: 20,
	});
	const entity2BlockedCached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		required_balance: 21,
	});

	expect(entity1AllowedCached.allowed).toBe(true);
	expect(entity1BlockedCached.allowed).toBe(false);
	expect(entity2AllowedCached.allowed).toBe(true);
	expect(entity2BlockedCached.allowed).toBe(false);

	await timeout(4000);

	const entity1AllowedUncached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		skip_cache: true,
	});
	const entity1BlockedUncached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 6,
		skip_cache: true,
	});
	const entity2AllowedUncached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		required_balance: 20,
		skip_cache: true,
	});
	const entity2BlockedUncached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		required_balance: 21,
		skip_cache: true,
	});

	expect(normalizeCheckResponse(entity1AllowedUncached)).toEqual(
		normalizeCheckResponse(entity1AllowedCached),
	);
	expect(normalizeCheckResponse(entity1BlockedUncached)).toEqual(
		normalizeCheckResponse(entity1BlockedCached),
	);
	expect(normalizeCheckResponse(entity2AllowedUncached)).toEqual(
		normalizeCheckResponse(entity2AllowedCached),
	);
	expect(normalizeCheckResponse(entity2BlockedUncached)).toEqual(
		normalizeCheckResponse(entity2BlockedCached),
	);
});

test.concurrent(`${chalk.yellowBright("check-entity-product-spend-limit4: allocated workflows entity product respects spend limit and cache parity")}`, async () => {
	const entityProduct = products.base({
		id: "entity-product-workflows",
		items: [items.allocatedWorkflows({ includedUsage: 1 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-entity-product-spend-limit-4",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
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
		value: 2,
	});

	await expectBoundaryAndParity({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Workflows,
		allowedRequiredBalance: 1,
		blockedRequiredBalance: 2,
	});
});

test.concurrent(`${chalk.yellowBright("check-entity-product-spend-limit5: credit-system entity product uses converted credits and cache parity")}`, async () => {
	const includedCredits = 100;
	const spendLimitCredits = 25;
	const existingOverageCredits = 20;

	const entityProduct = products.base({
		id: "entity-product-credits",
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
		customerId: "check-entity-product-spend-limit-5",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	const creditsFeature = ctx.features.find(
		(f) => f.id === TestFeature.Credits,
	)!;
	const action1CreditCost = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditsFeature,
		amount: 1,
	});
	const creditsRemainingUntilLimit = spendLimitCredits - existingOverageCredits;
	const usageToReachOverageBoundary = getActionUnitsForCreditAmount({
		creditAmount: includedCredits + existingOverageCredits,
		creditCostPerActionUnit: action1CreditCost,
	});
	const allowedActionUnits = getActionUnitsForCreditAmount({
		creditAmount: creditsRemainingUntilLimit,
		creditCostPerActionUnit: action1CreditCost,
	});
	const blockedActionUnits = getActionUnitsForCreditAmount({
		creditAmount: creditsRemainingUntilLimit + 1,
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
		value: usageToReachOverageBoundary,
	});

	await expectBoundaryAndParity({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Action1,
		allowedRequiredBalance: allowedActionUnits,
		blockedRequiredBalance: blockedActionUnits,
		expectedFeatureId: TestFeature.Credits,
		expectedAllowedResponseRequiredBalance: creditsRemainingUntilLimit,
		expectedBlockedResponseRequiredBalance: creditsRemainingUntilLimit + 1,
	});
});

test.concurrent(`${chalk.yellowBright("check-entity-product-spend-limit6: disabled spend limit falls back to max_purchase and matches skip_cache")}`, async () => {
	const entityProduct = products.base({
		id: "entity-product-disabled-limit",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				maxPurchase: 300,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-entity-product-spend-limit-6",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
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

	const cached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 50,
	});

	expect(cached.allowed).toBe(true);
	expect(cached.balance?.feature_id).toBe(TestFeature.Messages);
	expect(cached.required_balance).toBe(50);

	await timeout(4000);

	const uncached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 50,
		skip_cache: true,
	});

	expect(normalizeCheckResponse(uncached)).toEqual(
		normalizeCheckResponse(cached),
	);
});
