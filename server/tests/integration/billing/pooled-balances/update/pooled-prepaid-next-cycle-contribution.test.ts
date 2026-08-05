/**
 * TDD contract for pooled prepaid next-cycle contribution promotion.
 *
 * Contract under test:
 *   New behaviors:
 *     - updateSubscription quantity DECREASE (OnDecrease.NoProrations) on a
 *       pooled prepaid contributor writes the pending amount on its
 *       contribution row: current_contribution unchanged,
 *       next_cycle_contribution = new amount, effective_at = sub period end;
 *       pool granted and balance are unchanged this cycle;
 *     - a pool reset with a contribution whose effective_at has passed
 *       promotes it (current = next_cycle, effective_at cleared), recomputes
 *       pooled_balances.granted from ALL contributions in one statement, and
 *       refills the pool balance to the NEW granted;
 *     - contributions whose effective_at is still in the future are untouched
 *       (staggered boundaries promote independently);
 *     - the recompute self-heals a drifted pooled_balances.granted.
 *   Side effects:
 *     - pooled_balance_contributions and pooled_balances.granted are updated
 *       at reset time.
 *
 * Pre-impl red: the UpdateQuantity plan never touches contributions
 * (effective_at stays null) and no reset path promotes next_cycle_contribution.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	entities as entityTable,
	OnDecrease,
	OnIncrease,
	PooledBalanceResetMode,
	pooledBalanceContributions,
	pooledBalances,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { expirePooledBalanceForReset } from "../utils/expirePooledBalanceForReset.js";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const BILLING_UNITS = 100;
const ATTACHED_QUANTITY = 300;
const DOWNGRADED_QUANTITY = 100;
const SECOND_DOWNGRADED_QUANTITY = 200;

const sortedContributions = async ({
	ctx,
	customerId,
}: {
	ctx: { db: Parameters<typeof getPooledBalanceDbState>[0]["db"] };
	customerId: string;
}) => {
	const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
	return {
		state,
		contributions: [...state.contributions].sort(
			(a, b) => a.next_cycle_contribution - b.next_cycle_contribution,
		),
	};
};

test.concurrent(
	`${chalk.yellowBright("pooled prepaid: quantity downgrades defer to next cycle and promote on reset")}`,
	async () => {
		const customerId = "pooled-prepaid-next-cycle";
		const prepaidPooledItem = {
			...items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: BILLING_UNITS,
				price: 10,
				config: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.NoProrations,
				},
			}),
			pooled: true,
		};
		const pooledPlan = products.pro({
			id: `${customerId}-plan`,
			items: [prepaidPooledItem],
		});

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({
					productId: pooledPlan.id,
					entityIndex: 0,
					options: [
						{ feature_id: TestFeature.Messages, quantity: ATTACHED_QUANTITY },
					],
				}),
				s.billing.attach({
					productId: pooledPlan.id,
					entityIndex: 1,
					options: [
						{ feature_id: TestFeature.Messages, quantity: ATTACHED_QUANTITY },
					],
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 100,
					timeout: 2_000,
				}),
			],
		});
		const pooledGrant = ATTACHED_QUANTITY * 2;

		// ── Contract: pool cusEnts are not stamped, sources resolvable per entity ──
		const { state: attachedState } = await sortedContributions({
			ctx,
			customerId,
		});
		const internalCustomerId = attachedState.pools[0]?.internal_customer_id;
		if (!internalCustomerId) throw new Error("Expected a pooled balance");
		const entityRows = await ctx.db
			.select({ id: entityTable.id, internal_id: entityTable.internal_id })
			.from(entityTable)
			.where(
				and(
					eq(entityTable.internal_customer_id, internalCustomerId),
					inArray(
						entityTable.id,
						entities.map((entity) => entity.id),
					),
				),
			);
		const customerProductForEntity = (entityIndex: number) => {
			const internalEntityId = entityRows.find(
				(row) => row.id === entities[entityIndex].id,
			)?.internal_id;
			const customerProduct = attachedState.sourceCustomerProducts.find(
				(candidate) => candidate.internal_entity_id === internalEntityId,
			);
			if (!customerProduct) {
				throw new Error(
					`Expected a pooled customer product for entity ${entityIndex}`,
				);
			}
			return customerProduct;
		};

		const downgradeEntityQuantity = async ({
			entityIndex,
			quantity,
		}: {
			entityIndex: number;
			quantity: number;
		}) =>
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				customer_product_id: customerProductForEntity(entityIndex).id,
				entity_id: entities[entityIndex].id,
				feature_quantities: [{ feature_id: TestFeature.Messages, quantity }],
				redirect_mode: "if_required",
			});

		// ── Contract: downgrades write next_cycle_contribution + effective_at ──
		await downgradeEntityQuantity({
			entityIndex: 0,
			quantity: DOWNGRADED_QUANTITY,
		});
		await downgradeEntityQuantity({
			entityIndex: 1,
			quantity: SECOND_DOWNGRADED_QUANTITY,
		});

		const { state: downgradedState, contributions: downgradedContributions } =
			await sortedContributions({ ctx, customerId });
		expect(downgradedContributions).toHaveLength(2);
		expect(downgradedContributions[0]).toMatchObject({
			current_contribution: ATTACHED_QUANTITY,
			next_cycle_contribution: DOWNGRADED_QUANTITY,
		});
		expect(downgradedContributions[0].effective_at).toBeGreaterThan(Date.now());
		expect(downgradedContributions[1]).toMatchObject({
			current_contribution: ATTACHED_QUANTITY,
			next_cycle_contribution: SECOND_DOWNGRADED_QUANTITY,
		});
		expect(downgradedContributions[1].effective_at).toBeGreaterThan(Date.now());

		// ── Contract: pool untouched until a boundary passes ──
		expect(downgradedState.pools[0]?.granted).toBe(pooledGrant);
		expect(downgradedState.poolCustomerEntitlements[0]?.balance).toBe(
			pooledGrant - 100,
		);

		// ── Staggered boundary: only entity 0's downgrade becomes due ──
		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Subscription,
		});
		await ctx.db
			.update(pooledBalanceContributions)
			.set({ effective_at: Date.now() - 1_000 })
			.where(eq(pooledBalanceContributions.id, downgradedContributions[0].id));

		// ── Contract: reset promotes only the due contribution ──
		const staggeredGrant = DOWNGRADED_QUANTITY + ATTACHED_QUANTITY;
		const afterFirstReset = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: afterFirstReset,
			featureId: TestFeature.Messages,
			granted: staggeredGrant,
			remaining: staggeredGrant,
			usage: 0,
		});

		const { state: staggeredState, contributions: staggeredContributions } =
			await sortedContributions({ ctx, customerId });
		expect(staggeredContributions[0]).toMatchObject({
			current_contribution: DOWNGRADED_QUANTITY,
			next_cycle_contribution: DOWNGRADED_QUANTITY,
			effective_at: null,
		});
		expect(staggeredContributions[1]).toMatchObject({
			current_contribution: ATTACHED_QUANTITY,
			next_cycle_contribution: SECOND_DOWNGRADED_QUANTITY,
		});
		expect(staggeredContributions[1].effective_at).not.toBeNull();
		expect(staggeredState.pools[0]?.granted).toBe(staggeredGrant);
		expect(staggeredState.poolCustomerEntitlements[0]?.balance).toBe(
			staggeredGrant,
		);

		// ── Contract: second boundary promotes entity 1 AND heals drifted granted ──
		// Warm the cache first so this reset runs on the CACHE-HIT lazy path and
		// must patch granted into the cached subject (not just the DB).
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const poolId = staggeredState.pools[0]?.id;
		if (!poolId) throw new Error("Expected the pooled balance to persist");
		await ctx.db
			.update(pooledBalances)
			.set({ granted: 9_999 })
			.where(eq(pooledBalances.id, poolId));
		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Subscription,
		});
		await ctx.db
			.update(pooledBalanceContributions)
			.set({ effective_at: Date.now() - 1_000 })
			.where(eq(pooledBalanceContributions.id, staggeredContributions[1].id));

		const settledGrant = DOWNGRADED_QUANTITY + SECOND_DOWNGRADED_QUANTITY;
		const afterSecondReset =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterSecondReset,
			featureId: TestFeature.Messages,
			granted: settledGrant,
			remaining: settledGrant,
			usage: 0,
		});

		// ── Contract: the patched granted persists on a later cached read ──
		const cachedRead =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: cachedRead,
			featureId: TestFeature.Messages,
			granted: settledGrant,
			remaining: settledGrant,
			usage: 0,
		});

		const { state: settledState, contributions: settledContributions } =
			await sortedContributions({ ctx, customerId });
		expect(settledContributions[0]).toMatchObject({
			current_contribution: DOWNGRADED_QUANTITY,
			next_cycle_contribution: DOWNGRADED_QUANTITY,
			effective_at: null,
		});
		expect(settledContributions[1]).toMatchObject({
			current_contribution: SECOND_DOWNGRADED_QUANTITY,
			next_cycle_contribution: SECOND_DOWNGRADED_QUANTITY,
			effective_at: null,
		});
		expect(settledState.pools[0]?.granted).toBe(settledGrant);
		expect(settledState.poolCustomerEntitlements[0]?.balance).toBe(
			settledGrant,
		);
	},
);
