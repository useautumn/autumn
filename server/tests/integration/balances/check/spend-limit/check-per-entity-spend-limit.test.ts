import { expect, test } from "bun:test";
import type { CheckResponseV3, EntityBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

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

test.concurrent(`${chalk.yellowBright("check-per-entity-spend-limit1: lifetime + consumable per-entity messages respect spend limit and cache parity")}`, async () => {
	const perEntityProduct = products.base({
		id: "per-entity-lifetime-consumable",
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
		customerId: "check-per-entity-spend-limit-1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: perEntityProduct.id })],
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

test.concurrent(`${chalk.yellowBright("check-per-entity-spend-limit2: prepaid + consumable per-entity messages respect spend limit and cache parity")}`, async () => {
	const perEntityProduct = products.base({
		id: "per-entity-prepaid-consumable",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 8.5,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumableMessages({
				includedUsage: 200,
				maxPurchase: 300,
				price: 0.5,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const prepaidQuantity = 500;
	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-per-entity-spend-limit-2",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
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

test.concurrent(`${chalk.yellowBright("check-per-entity-spend-limit3: allocated workflows per entity respect spend limit and cache parity")}`, async () => {
	const workflowItem = {
		...constructArrearProratedItem({
			featureId: TestFeature.Workflows,
			pricePerUnit: 10,
			includedUsage: 1,
		}),
		entity_feature_id: TestFeature.Users,
	};

	const perEntityProduct = products.base({
		id: "per-entity-workflows",
		items: [workflowItem],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-per-entity-spend-limit-3",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: perEntityProduct.id })],
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

test.concurrent(`${chalk.yellowBright("check-per-entity-spend-limit4: credit-system checks use converted credits and respect spend limit with cache parity")}`, async () => {
	const includedCredits = 100;
	const spendLimitCredits = 25;
	const existingOverageCredits = 20;

	const perEntityCredits = items.consumable({
		featureId: TestFeature.Credits,
		includedUsage: 100,
		maxPurchase: 300,
		price: 0.5,
		entityFeatureId: TestFeature.Users,
	});

	const perEntityProduct = products.base({
		id: "per-entity-credits",
		items: [perEntityCredits],
	});

	const { autumnV2_1, customerId, entities, ctx } = await initScenario({
		customerId: "check-per-entity-spend-limit-4",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [perEntityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: perEntityProduct.id })],
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
