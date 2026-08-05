/**
 * TDD contract for the promotion-vs-transition guard.
 *
 * Contract under test:
 *   - promoteDuePooledContributions must NOT apply when a concurrent
 *     transaction (attach/updateSubscription writing the pool row) commits
 *     mid-statement: the pool UPDATE's row-version check (updated_at latest
 *     vs statement snapshot) fails, and the WHOLE statement no-ops —
 *     granted keeps the transition's value, the due contribution stays
 *     pending, and the helper returns null (so no cache patch is emitted);
 *   - a follow-up promotion with no concurrency applies normally and
 *     converges granted to the contribution sum.
 *
 * Pre-impl red: the pool write has no row-version guard, so the unblocked
 * statement stomps the transition's granted with its stale snapshot sum.
 */

import { expect, test } from "bun:test";
import { pooledBalanceContributions, pooledBalances } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { promoteDuePooledContributions } from "@/internal/billing/v2/pooledBalances/execute/promoteDuePooledContributions.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const ENTITY_GRANT = 250;
const DOWNGRADED_CONTRIBUTION = 100;
const TRANSITION_GRANTED = 900;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test(`${chalk.yellowBright("pooled promotion: concurrent pool-row write makes the promotion no-op")}`, async () => {
	const customerId = "pooled-promo-transition-guard";
	const pooledPlan = products.base({
		id: `${customerId}-plan`,
		items: [
			{
				...items.monthlyMessages({ includedUsage: ENTITY_GRANT }),
				pooled: true,
			},
		],
	});
	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [pooledPlan] }),
		],
		actions: [
			s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
			s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
		],
	});

	// Pending deferred downgrade on one contribution, already due.
	const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
	const pool = state.pools[0];
	const pendingContribution = state.contributions[0];
	if (!pool || !pendingContribution) {
		throw new Error("Expected a pooled balance with contributions");
	}
	await ctx.db
		.update(pooledBalanceContributions)
		.set({
			next_cycle_contribution: DOWNGRADED_CONTRIBUTION,
			effective_at: Date.now() - 1_000,
		})
		.where(eq(pooledBalanceContributions.id, pendingContribution.id));

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const poolCustomerEntitlement =
		fullCustomer.pooled_customer_entitlements?.[0];
	if (!poolCustomerEntitlement?.pooled_balance) {
		throw new Error("Expected the synthetic pooled customer entitlement");
	}

	// ── Hold a pool-row lock from a "transition" transaction, run the
	// promotion into it, then commit the transition mid-statement. ──
	let releaseTransition!: () => void;
	const transitionHold = new Promise<void>((resolve) => {
		releaseTransition = resolve;
	});
	let transitionLockAcquired!: () => void;
	const transitionLockAcquiredPromise = new Promise<void>((resolve) => {
		transitionLockAcquired = resolve;
	});

	const transitionTransaction = ctx.db.transaction(async (tx) => {
		await tx
			.update(pooledBalances)
			.set({ granted: TRANSITION_GRANTED, updated_at: Date.now() })
			.where(eq(pooledBalances.id, pool.id));
		transitionLockAcquired();
		await transitionHold;
	});

	await transitionLockAcquiredPromise;
	const promotionPromise = promoteDuePooledContributions({
		ctx,
		customerEntitlement: poolCustomerEntitlement,
		now: Date.now(),
	});
	// Let the promotion statement reach (and block on) the locked pool row.
	await sleep(500);
	releaseTransition();
	await transitionTransaction;
	const promotionResult = await promotionPromise;

	// ── Contract: guard trips → whole statement no-ops, helper returns null ──
	expect(promotionResult).toBeNull();

	// ── Contract: in-memory granted is refreshed to the winner's value, so a
	// CAS-winning caller cannot refill the balance from its stale snapshot ──
	expect(poolCustomerEntitlement.pooled_balance.granted).toBe(
		TRANSITION_GRANTED,
	);

	const guardedState = await getPooledBalanceDbState({
		db: ctx.db,
		customerId,
	});
	expect(guardedState.pools[0]?.granted).toBe(TRANSITION_GRANTED);
	const guardedContribution = guardedState.contributions.find(
		(contribution) => contribution.id === pendingContribution.id,
	);
	expect(guardedContribution?.current_contribution).toBe(ENTITY_GRANT);
	expect(guardedContribution?.next_cycle_contribution).toBe(
		DOWNGRADED_CONTRIBUTION,
	);
	expect(guardedContribution?.effective_at).not.toBeNull();

	// ── Contract: uncontended re-run converges to the contribution sum ──
	const retryResult = await promoteDuePooledContributions({
		ctx,
		customerEntitlement: poolCustomerEntitlement,
		now: Date.now(),
	});
	const convergedGrant = DOWNGRADED_CONTRIBUTION + ENTITY_GRANT;
	expect(retryResult).toEqual({
		granted: convergedGrant,
		promotedCount: 1,
	});

	const convergedState = await getPooledBalanceDbState({
		db: ctx.db,
		customerId,
	});
	expect(convergedState.pools[0]?.granted).toBe(convergedGrant);
	const convergedContribution = convergedState.contributions.find(
		(contribution) => contribution.id === pendingContribution.id,
	);
	expect(convergedContribution?.current_contribution).toBe(
		DOWNGRADED_CONTRIBUTION,
	);
	expect(convergedContribution?.effective_at).toBeNull();
});
