import { expect } from "bun:test";
import {
	customerEntitlements,
	entitlements,
	pooledBalanceContributions,
	pooledBalances,
	rollovers,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { getPooledBalanceDbState } from "./getPooledBalanceDbState.js";

type RolloverConfig = Parameters<
	typeof items.monthlyMessagesWithRollover
>[0]["rolloverConfig"];

/** Mirrors scripts-v2 combine-pools/select-candidate-pool: subscription-linked
 * pools win outright, then most rollovers, then largest grant, then oldest. */
const selectSurvivingPool = <
	T extends {
		stripe_subscription_id: string | null;
		granted: number;
		created_at: number;
	},
>({
	pools,
	rolloverCountByPoolId,
}: {
	pools: T[];
	rolloverCountByPoolId: Map<string, number>;
}) => {
	const byPreference = (a: T & { id: string }, b: T & { id: string }) =>
		(rolloverCountByPoolId.get(b.id) ?? 0) -
			(rolloverCountByPoolId.get(a.id) ?? 0) ||
		b.granted - a.granted ||
		a.created_at - b.created_at;

	const candidates = (pools as (T & { id: string })[]).filter(
		(pool) => pool.stripe_subscription_id != null,
	);
	return [...(candidates.length > 0 ? candidates : (pools as (T & { id: string })[]))].sort(
		byPreference,
	)[0];
};

/**
 * Folds every other pool into one surviving pool, exactly as the production
 * combine-pools script does: contributions and rollovers repoint, balance and
 * granted fold in, the losing pool graph is deleted.
 *
 * The point of doing it faithfully is the side effect — a contribution now sits
 * on a pool whose identity belongs to a different subscription.
 */
export const mergePooledBalances = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
	if (state.pools.length < 2) {
		throw new Error(
			`Expected at least 2 pools to merge for '${customerId}', found ${state.pools.length}`,
		);
	}

	const rolloverCountByPoolId = new Map(
		state.pools.map((pool) => [
			pool.id,
			state.poolCustomerEntitlements.find(
				(candidate) => candidate.id === pool.customer_entitlement_id,
			)?.rollovers?.length ?? 0,
		]),
	);
	const survivor = selectSurvivingPool({
		pools: state.pools,
		rolloverCountByPoolId,
	});
	const losers = state.pools.filter((pool) => pool.id !== survivor.id);
	const loserPoolIds = losers.map((pool) => pool.id);
	const loserCusEntIds = losers.map((pool) => pool.customer_entitlement_id);
	const loserCusEnts = state.poolCustomerEntitlements.filter((candidate) =>
		loserCusEntIds.includes(candidate.id),
	);

	const balanceDelta = loserCusEnts.reduce(
		(sum, cusEnt) => sum + (cusEnt.balance ?? 0),
		0,
	);
	const grantedDelta = losers.reduce((sum, pool) => sum + pool.granted, 0);
	const now = Date.now();

	await ctx.db.transaction(async (tx) => {
		await tx
			.update(pooledBalanceContributions)
			.set({ pooled_balance_id: survivor.id, updated_at: now })
			.where(
				inArray(pooledBalanceContributions.pooled_balance_id, loserPoolIds),
			);

		await tx
			.update(rollovers)
			.set({ cus_ent_id: survivor.customer_entitlement_id })
			.where(inArray(rollovers.cus_ent_id, loserCusEntIds));

		await tx
			.update(customerEntitlements)
			.set({
				balance: sql`COALESCE(${customerEntitlements.balance}, 0) + ${balanceDelta}`,
				cache_version: sql`${customerEntitlements.cache_version} + 1`,
			})
			.where(eq(customerEntitlements.id, survivor.customer_entitlement_id));

		await tx
			.update(pooledBalances)
			.set({
				granted: sql`COALESCE(${pooledBalances.granted}, 0) + ${grantedDelta}`,
				updated_at: now,
			})
			.where(eq(pooledBalances.id, survivor.id));

		await tx.delete(pooledBalances).where(inArray(pooledBalances.id, loserPoolIds));
		await tx
			.delete(customerEntitlements)
			.where(inArray(customerEntitlements.id, loserCusEntIds));

		for (const cusEnt of loserCusEnts) {
			await tx.delete(entitlements).where(
				and(
					eq(entitlements.id, cusEnt.entitlement_id),
					notExists(
						tx
							.select({ one: sql`1` })
							.from(customerEntitlements)
							.where(eq(customerEntitlements.entitlement_id, cusEnt.entitlement_id)),
					),
				),
			);
		}
	});

	return { survivorPoolId: survivor.id, balanceDelta, grantedDelta };
};

/**
 * Recreates the production shape behind the pooled-balance incidents:
 *   entity 1 attaches the plan, entity 2 attaches the SAME plan on its own
 *   Stripe subscription (so each gets its own pool), then the pools are merged.
 *
 * Afterwards entity 2's contribution sits on a pool identified by entity 1's
 * subscription — the "wrong identity" state. Transitioning entity 2 is what
 * exercises the removal/insert path.
 */
export type MergedPoolVariant =
	/** Two paid plans, each on its own Stripe subscription. */
	| "two-subscriptions"
	/** A free plan (lazy reset, no subscription) alongside a paid one. */
	| "free-and-subscription";

export const setupMergedPoolScenario = async ({
	customerId,
	grant,
	rolloverConfig,
	advanceToNextInvoice = false,
	usage,
	variant = "two-subscriptions",
}: {
	customerId: string;
	grant: number;
	rolloverConfig?: RolloverConfig;
	advanceToNextInvoice?: boolean;
	usage?: { value: number; entityIndex: number };
	variant?: MergedPoolVariant;
}) => {
	const pooledItem = rolloverConfig
		? {
				...items.monthlyMessagesWithRollover({
					includedUsage: grant,
					rolloverConfig,
				}),
				pooled: true,
			}
		: { ...items.monthlyMessages({ includedUsage: grant }), pooled: true };

	const paidPlan = products.pro({
		id: `${customerId}-paid`,
		items: [pooledItem],
	});
	// Free => reset_mode lazy with no subscription id, so it mints a pool whose
	// identity differs from the paid plan's on more than just the subscription.
	const freePlan = products.base({
		id: `${customerId}-free`,
		items: [pooledItem],
	});
	const isFreeVariant = variant === "free-and-subscription";
	const secondPlan = isFreeVariant ? freePlan : paidPlan;

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({
				list: isFreeVariant ? [paidPlan, freePlan] : [paidPlan],
			}),
		],
		actions: [
			s.billing.attach({ productId: paidPlan.id, entityIndex: 0 }),
			s.billing.attach({
				productId: secondPlan.id,
				entityIndex: 1,
				// A second paid attach needs its own subscription to mint its own
				// pool; the free plan already has a distinct identity.
				...(isFreeVariant ? {} : { newBillingSubscription: true }),
			}),
			...(usage
				? [
						s.track({
							featureId: TestFeature.Messages,
							value: usage.value,
							entityIndex: usage.entityIndex,
							timeout: 2000,
						}),
					]
				: []),
			...(advanceToNextInvoice ? [s.advanceToNextInvoice()] : []),
		],
	});

	// ── Precondition: two pools, one per subscription.
	const beforeMerge = await getPooledBalanceDbState({
		db: scenario.ctx.db,
		customerId,
	});
	expect(beforeMerge.pools).toHaveLength(2);
	expect(
		new Set(beforeMerge.pools.map((pool) => pool.stripe_subscription_id)).size,
	).toBe(2);

	const merge = await mergePooledBalances({ ctx: scenario.ctx, customerId });

	const afterMerge = await getPooledBalanceDbState({
		db: scenario.ctx.db,
		customerId,
	});
	expect(afterMerge.pools).toHaveLength(1);
	const mergedPool = afterMerge.pools[0];

	// The plan whose contribution was repointed now sits on a pool identified by
	// the other subscription — this is the customer product to transition.
	const pooledCustomerProducts = afterMerge.sourceCustomerProducts.filter(
		(customerProduct) =>
			customerProduct.product_id === paidPlan.id ||
			customerProduct.product_id === secondPlan.id,
	);
	const mismatchedCustomerProduct = pooledCustomerProducts.find(
		(customerProduct) =>
			(customerProduct.subscription_ids?.[0] ?? null) !==
			mergedPool.stripe_subscription_id,
	);
	const alignedCustomerProduct = pooledCustomerProducts.find(
		(customerProduct) =>
			(customerProduct.subscription_ids?.[0] ?? null) ===
			mergedPool.stripe_subscription_id,
	);
	if (!(mismatchedCustomerProduct && alignedCustomerProduct)) {
		throw new Error(
			"Expected one aligned and one mis-matched customer product after the merge",
		);
	}

	return {
		...scenario,
		plan: paidPlan,
		paidPlan,
		freePlan,
		secondPlan,
		merge,
		mergedPool,
		mismatchedCustomerProduct,
		alignedCustomerProduct,
		mismatchedEntityId: mismatchedCustomerProduct.entity_id,
		alignedEntityId: alignedCustomerProduct.entity_id,
	};
};
