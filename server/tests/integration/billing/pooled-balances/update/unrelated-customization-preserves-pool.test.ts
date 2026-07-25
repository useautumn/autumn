/**
 * TDD coverage: updateSubscription customizations that do NOT touch the pooled
 * item must leave the pooled balance completely alone.
 *
 * Contract under test:
 *   New behaviors (updateSubscription customize, pooled item untouched):
 *     - add_items: [new non-pooled feature]      -> pool untouched, new feature readable
 *     - remove_items: [existing non-pooled item] -> pool untouched, feature gone
 *     - price: changed base price                -> pool untouched, price applied
 *   Side effects (invariant after each):
 *     - pooled_balances: exactly 1 row, same id, granted unchanged
 *     - pooled_balance_contributions: exactly 1 row, same id, same amounts
 *     - synthetic pooled cusEnt: same id, balance unchanged
 *     - the pool's rollover rows survive unchanged (count and balance)
 *     - readable pooled balance unchanged
 *
 * This is a regression guard, not a discovery: it pins the invariant that an
 * unrelated edit never re-contributes or re-carries onto the pool. The rollover
 * assertion is the interesting one — a pooled source that retained rollover
 * state used to re-carry it onto the pool on every subsequent update.
 *
 * Existing sibling coverage (customize-pooled-balance.test.ts) covers editing an
 * EXISTING unrelated item's included amount. These three edits change the shape
 * of the plan instead, and none of them are covered there.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	EntInterval,
	PooledBalanceResetMode,
	RolloverExpiryDurationType,
	rollovers,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { generateId } from "@/utils/genUtils.js";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";
import {
	getPooledBalanceDbState,
	getPooledSourceCustomerProduct,
} from "../utils/getPooledBalanceDbState.js";

const INITIAL_GRANT = 100;
const INITIAL_WORDS_GRANT = 25;
const USAGE = 50;
const SEEDED_ROLLOVER = 40;
const UPDATED_PRICE = 55;
const ADDED_CREDITS = 250;

type Scenario = Awaited<ReturnType<typeof setupPooledScenarioWithRollover>>;

/**
 * Seeds a rollover directly onto the pool. Minting one for real needs a cycle
 * advance; the invariant under test is that it SURVIVES, not how it got there.
 */
const setupPooledScenarioWithRollover = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const plan = products.pro({
		id: `${customerId}-plan`,
		items: [
			{
				...items.monthlyMessagesWithRollover({
					includedUsage: INITIAL_GRANT,
					rolloverConfig: {
						max: 500,
						length: 1,
						duration: RolloverExpiryDurationType.Month,
					},
				}),
				pooled: true,
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
				entityIndex: 1,
				timeout: 2000,
			}),
		],
	});

	const before = await getPooledBalanceDbState({
		db: scenario.ctx.db,
		customerId,
	});
	const sourceCustomerProduct = getPooledSourceCustomerProduct({
		state: before,
		productId: plan.id,
		entityId: scenario.entities[0].id,
	});
	const sourceContributionId = before.contributions.find(
		(contribution) =>
			contribution.source_customer_product_id === sourceCustomerProduct.id,
	)?.id;
	const pooledCustomerEntitlement = before.poolCustomerEntitlements[0];
	if (!pooledCustomerEntitlement) {
		throw new Error("Expected a pooled customer entitlement");
	}
	if (!sourceContributionId) {
		throw new Error("Expected the original pooled contribution");
	}

	await scenario.ctx.db.insert(rollovers).values({
		id: generateId("roll"),
		cus_ent_id: pooledCustomerEntitlement.id,
		balance: SEEDED_ROLLOVER,
		entities: {},
		expires_at: null,
	});

	return {
		...scenario,
		plan,
		sourceCustomerProduct,
		sourceContributionId,
		pooledCustomerEntitlementId: pooledCustomerEntitlement.id,
		poolId: before.pools[0].id,
	};
};

const expectPoolUntouched = async ({
	scenario,
}: {
	scenario: Awaited<ReturnType<typeof setupPooledScenarioWithRollover>>;
}) => {
	const state = await expectPooledBalanceCorrect({
		db: scenario.ctx.db,
		customerId: scenario.customerId,
		pool: {
			count: 1,
			balance: INITIAL_GRANT - USAGE,
			adjustment: 0,
			granted: INITIAL_GRANT,
			interval: EntInterval.Month,
			nextResetAt: "present",
			resetCycleAnchor: "present",
			resetMode: PooledBalanceResetMode.Subscription,
			stripeSubscriptionId: "stripe_subscription",
			rollovers: [{ balance: SEEDED_ROLLOVER }],
		},
		contributions: {
			count: 1,
			currentContribution: INITIAL_GRANT,
			nextCycleContribution: INITIAL_GRANT,
		},
		sources: { count: 1, balance: 0, adjustment: 0 },
	});

	// Same rows, not equivalent replacements.
	expect(state.pools[0].id).toBe(scenario.poolId);
	expect(state.poolCustomerEntitlements[0].id).toBe(
		scenario.pooledCustomerEntitlementId,
	);
	expect(state.contributions[0].id).toBe(scenario.sourceContributionId);

	const customer = await scenario.autumnV2_2.customers.get<ApiCustomerV5>(
		scenario.customerId,
		{ skip_cache: "true" },
	);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		// The API folds surviving rollover into the reported grant.
		granted: INITIAL_GRANT + SEEDED_ROLLOVER,
		remaining: INITIAL_GRANT - USAGE + SEEDED_ROLLOVER,
		usage: USAGE,
		planId: null,
		breakdownCount: 1,
	});

	return { state, customer };
};

const updateSubscription = async ({
	scenario,
	customize,
}: {
	scenario: Scenario;
	customize: NonNullable<UpdateSubscriptionV1ParamsInput["customize"]>;
}) =>
	scenario.autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: scenario.customerId,
		customer_product_id: scenario.sourceCustomerProduct.id,
		entity_id: scenario.entities[0].id,
		customize,
	});

test(
	chalk.yellowBright(
		"pooled unrelated customize: adding a non-pooled feature leaves the pool untouched",
	),
	async () => {
		const scenario = await setupPooledScenarioWithRollover({
			customerId: "pooled-unrelated-add-item",
		});

		await updateSubscription({
			scenario,
			customize: {
				add_items: [itemsV2.monthlyCredits({ included: ADDED_CREDITS })],
			},
		});

		const { customer } = await expectPoolUntouched({ scenario });

		// The edit itself landed — otherwise the invariant holds vacuously.
		expect(customer.balances?.[TestFeature.Credits]?.granted).toBe(
			ADDED_CREDITS,
		);
	},
);

test(
	chalk.yellowBright(
		"pooled unrelated customize: removing a non-pooled feature leaves the pool untouched",
	),
	async () => {
		const scenario = await setupPooledScenarioWithRollover({
			customerId: "pooled-unrelated-remove-item",
		});

		await updateSubscription({
			scenario,
			customize: { remove_items: [{ feature_id: TestFeature.Words }] },
		});

		const { customer } = await expectPoolUntouched({ scenario });

		expect(customer.balances?.[TestFeature.Words]).toBeUndefined();
	},
);

test(
	chalk.yellowBright(
		"pooled unrelated customize: changing the base price leaves the pool untouched",
	),
	async () => {
		const scenario = await setupPooledScenarioWithRollover({
			customerId: "pooled-unrelated-price",
		});

		await updateSubscription({
			scenario,
			customize: { price: itemsV2.monthlyPrice({ amount: UPDATED_PRICE }) },
		});

		await expectPoolUntouched({ scenario });
	},
);
