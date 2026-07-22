import { expect } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	CusProductStatus,
	EntInterval,
	PooledBalanceResetMode,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import type { MigrationUpdatePlanCustomize } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { expectPooledBalanceCorrect } from "./expectPooledBalanceCorrect.js";
import {
	getPooledBalanceDbState,
	getPooledSourceCustomerProduct,
} from "./getPooledBalanceDbState.js";

export type PooledCustomizationCase =
	| "unrelated_item"
	| "increase_grant"
	| "enable_pooling";

export type PooledCustomizationSurface = "put" | "patch" | "migration";

const INITIAL_GRANT = 100;
const UPDATED_GRANT = 200;
const INITIAL_WORDS_GRANT = 25;
const UPDATED_WORDS_GRANT = 75;
const USAGE = 50;

const MONTHLY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Subscription,
	stripeSubscriptionId: "stripe_subscription",
} as const;

export const buildPooledCustomization = ({
	case: customizationCase,
	surface,
}: {
	case: PooledCustomizationCase;
	surface: Exclude<PooledCustomizationSurface, "migration">;
}): NonNullable<UpdateSubscriptionV1ParamsInput["customize"]> => {
	if (surface === "put") {
		return {
			items: [
				{
					...itemsV2.monthlyMessages({
						included:
							customizationCase === "increase_grant"
								? UPDATED_GRANT
								: INITIAL_GRANT,
					}),
					pooled: true,
				},
				itemsV2.monthlyWords({
					included:
						customizationCase === "unrelated_item"
							? UPDATED_WORDS_GRANT
							: INITIAL_WORDS_GRANT,
				}),
			],
		};
	}

	return buildPooledPatchCustomization({ case: customizationCase });
};

export const buildRejectedPooledPricingCustomization = ({
	surface,
}: {
	surface: Exclude<PooledCustomizationSurface, "migration">;
}): NonNullable<UpdateSubscriptionV1ParamsInput["customize"]> => {
	const pooledItem = {
		...itemsV2.consumableMessages(),
		pooled: true,
	};

	if (surface === "put") {
		return {
			items: [
				pooledItem,
				itemsV2.monthlyWords({ included: INITIAL_WORDS_GRANT }),
			],
		};
	}

	return {
		remove_items: [{ feature_id: TestFeature.Messages }],
		add_items: [pooledItem],
	};
};

const buildPooledPatchCustomization = ({
	case: customizationCase,
}: {
	case: PooledCustomizationCase;
}) => {
	if (customizationCase === "unrelated_item") {
		return {
			update_items: [
				{
					filter: { feature_id: TestFeature.Words },
					included: UPDATED_WORDS_GRANT,
				},
			],
		};
	}

	if (customizationCase === "increase_grant") {
		return {
			update_items: [
				{
					filter: { feature_id: TestFeature.Messages },
					included: UPDATED_GRANT,
				},
			],
		};
	}

	return {
		remove_items: [{ feature_id: TestFeature.Messages }],
		add_items: [
			{
				...itemsV2.monthlyMessages({ included: INITIAL_GRANT }),
				pooled: true,
			},
		],
	};
};

export const buildPooledMigrationCustomization = ({
	case: customizationCase,
}: {
	case: PooledCustomizationCase;
}): MigrationUpdatePlanCustomize =>
	buildPooledPatchCustomization({ case: customizationCase });

export const setupPooledCustomizationScenario = async ({
	customerId,
	case: customizationCase,
}: {
	customerId: string;
	case: PooledCustomizationCase;
}) => {
	const initiallyPooled = customizationCase !== "enable_pooling";
	const plan = products.pro({
		id: `${customerId}-plan`,
		items: [
			{
				...items.monthlyMessages({ includedUsage: INITIAL_GRANT }),
				pooled: initiallyPooled,
			},
			items.monthlyWords({ includedUsage: INITIAL_WORDS_GRANT }),
		],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [plan] }),
		],
		actions: [
			s.billing.attach({ productId: plan.id, entityIndex: 0 }),
			s.track({
				featureId: TestFeature.Messages,
				value: USAGE,
				entityIndex: initiallyPooled ? 1 : 0,
				timeout: 2000,
			}),
		],
	});

	const state = initiallyPooled
		? await expectPooledBalanceCorrect({
				db: scenario.ctx.db,
				customerId,
				pool: {
					balance: INITIAL_GRANT - USAGE,
					adjustment: 0,
					granted: INITIAL_GRANT,
					...MONTHLY_POOL_LIFECYCLE,
				},
				contributions: {
					count: 1,
					currentContribution: INITIAL_GRANT,
					nextCycleContribution: INITIAL_GRANT,
				},
				sources: { count: 1, balance: 0, adjustment: 0 },
			})
		: await getPooledBalanceDbState({ db: scenario.ctx.db, customerId });

	if (!initiallyPooled) {
		expect(state.pools).toHaveLength(0);
		expect(state.contributions).toHaveLength(0);
	}

	const sourceCustomerProduct = getPooledSourceCustomerProduct({
		state,
		productId: plan.id,
		entityId: scenario.entities[0].id,
	});
	const sourceContribution = state.contributions.find(
		(contribution) =>
			contribution.source_customer_product_id === sourceCustomerProduct.id,
	);

	return {
		...scenario,
		plan,
		sourceCustomerProduct,
		sourceContributionId: sourceContribution?.id,
	};
};

export const expectPooledCustomizationResult = async ({
	scenario,
	case: customizationCase,
	surface,
}: {
	scenario: Awaited<ReturnType<typeof setupPooledCustomizationScenario>>;
	case: PooledCustomizationCase;
	surface: PooledCustomizationSurface;
}) => {
	const expectedGrant =
		customizationCase === "increase_grant" ? UPDATED_GRANT : INITIAL_GRANT;
	const expectedSourceCount =
		surface === "put" && customizationCase !== "enable_pooling" ? 2 : 1;
	const state = await expectPooledBalanceCorrect({
		db: scenario.ctx.db,
		customerId: scenario.customerId,
		pool: {
			balance: expectedGrant - USAGE,
			adjustment: 0,
			granted: expectedGrant,
			...MONTHLY_POOL_LIFECYCLE,
		},
		contributions: {
			count: 1,
			currentContribution: expectedGrant,
			nextCycleContribution: expectedGrant,
		},
		sources: { count: expectedSourceCount, balance: 0, adjustment: 0 },
	});

	const activeCustomerProduct = state.sourceCustomerProducts.find(
		(customerProduct) =>
			customerProduct.product_id === scenario.plan.id &&
			customerProduct.entity_id === scenario.entities[0].id &&
			customerProduct.status === CusProductStatus.Active,
	);
	expect(activeCustomerProduct).toBeDefined();
	expect(activeCustomerProduct?.id === scenario.sourceCustomerProduct.id).toBe(
		surface !== "put",
	);

	const activeContribution = state.contributions.find(
		(contribution) =>
			contribution.source_customer_product_id === activeCustomerProduct?.id,
	);
	expect(activeContribution).toMatchObject({
		current_contribution: expectedGrant,
		next_cycle_contribution: expectedGrant,
	});
	if (customizationCase === "unrelated_item" && surface !== "put") {
		expect(activeContribution?.id).toBe(scenario.sourceContributionId);
	}

	const customer = await scenario.autumnV2_2.customers.get<ApiCustomerV5>(
		scenario.customerId,
		{ skip_cache: "true" },
	);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		granted: expectedGrant,
		includedGrant: expectedGrant,
		remaining: expectedGrant - USAGE,
		usage: USAGE,
		planId: null,
		breakdownCount: 1,
	});

	const entity = await scenario.autumnV2_2.entities.get<ApiEntityV2>(
		scenario.customerId,
		scenario.entities[0].id,
		{ skip_cache: "true" },
	);
	expectBalanceCorrect({
		customer: entity,
		featureId: TestFeature.Words,
		granted:
			customizationCase === "unrelated_item"
				? UPDATED_WORDS_GRANT
				: INITIAL_WORDS_GRANT,
		remaining:
			customizationCase === "unrelated_item"
				? UPDATED_WORDS_GRANT
				: INITIAL_WORDS_GRANT,
		usage: 0,
		planId: scenario.plan.id,
		breakdownCount: 1,
	});
};

export const expectPooledCustomizationUnchanged = async ({
	scenario,
}: {
	scenario: Awaited<ReturnType<typeof setupPooledCustomizationScenario>>;
}) => {
	const state = await expectPooledBalanceCorrect({
		db: scenario.ctx.db,
		customerId: scenario.customerId,
		pool: {
			balance: INITIAL_GRANT - USAGE,
			adjustment: 0,
			granted: INITIAL_GRANT,
			...MONTHLY_POOL_LIFECYCLE,
		},
		contributions: {
			count: 1,
			currentContribution: INITIAL_GRANT,
			nextCycleContribution: INITIAL_GRANT,
		},
		sources: { count: 1, balance: 0, adjustment: 0 },
	});

	expect(
		state.sourceCustomerProducts.find(
			(customerProduct) =>
				customerProduct.id === scenario.sourceCustomerProduct.id,
		)?.status,
	).toBe(CusProductStatus.Active);
	if (!scenario.sourceContributionId) {
		throw new Error("Expected the original pooled contribution");
	}
	expect(state.contributions[0]?.id).toBe(scenario.sourceContributionId);
};
