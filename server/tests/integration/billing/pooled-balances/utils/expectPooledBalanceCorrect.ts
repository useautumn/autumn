import { expect } from "bun:test";
import type { EntInterval, PooledBalanceResetMode } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getPooledBalanceDbState } from "./getPooledBalanceDbState.js";

type PoolExpectation = {
	count?: number;
	balance: number;
	adjustment: number;
	cacheVersion?: number;
	granted: number;
	interval: EntInterval;
	nextResetAt: "present" | null;
	resetCycleAnchor: "present" | null;
	resetMode: PooledBalanceResetMode;
	stripeSubscriptionId: "stripe_subscription" | null;
	rollovers?: Array<{ balance: number; usage?: number }>;
};

type ContributionExpectation = {
	count: number;
	currentContribution?: number;
	nextCycleContribution?: number;
	excludedSourceCustomerProductIds?: string[];
};

type SourceExpectation = {
	count: number;
	balance?: number;
	adjustment?: number;
};

export const expectPooledBalanceCorrect = async ({
	db,
	customerId,
	pool,
	contributions,
	sources,
}: {
	db: DrizzleCli;
	customerId: string;
	pool: PoolExpectation;
	contributions: ContributionExpectation;
	sources: SourceExpectation;
}) => {
	const state = await getPooledBalanceDbState({ db, customerId });
	const poolCount = pool.count ?? 1;

	expect(state.pools).toHaveLength(poolCount);
	expect(state.poolCustomerEntitlements).toHaveLength(poolCount);
	for (const pooledCustomerEntitlement of state.poolCustomerEntitlements) {
		expect(pooledCustomerEntitlement).toMatchObject({
			is_pooled_balance: true,
			customer_product_id: null,
			balance: pool.balance,
			adjustment: pool.adjustment,
			...(pool.cacheVersion === undefined
				? {}
				: { cache_version: pool.cacheVersion }),
		});
		if (pool.nextResetAt === "present") {
			expect(pooledCustomerEntitlement.next_reset_at).not.toBeNull();
		} else {
			expect(pooledCustomerEntitlement.next_reset_at).toBeNull();
		}
		if (pool.rollovers) {
			expect(pooledCustomerEntitlement.rollovers).toHaveLength(
				pool.rollovers.length,
			);
			for (let index = 0; index < pool.rollovers.length; index++) {
				expect(pooledCustomerEntitlement.rollovers[index]).toMatchObject(
					pool.rollovers[index],
				);
			}
		}
	}

	for (const pooledBalance of state.pools) {
		expect(pooledBalance).toMatchObject({
			granted: pool.granted,
			interval: pool.interval,
			reset_mode: pool.resetMode,
			customer_license_link_id: null,
		});
		if (pool.resetCycleAnchor === "present") {
			expect(pooledBalance.reset_cycle_anchor).not.toBeNull();
		} else {
			expect(pooledBalance.reset_cycle_anchor).toBeNull();
		}
		if (pool.stripeSubscriptionId === "stripe_subscription") {
			expect(pooledBalance.stripe_subscription_id).toMatch(/^sub_/);
		} else {
			expect(pooledBalance.stripe_subscription_id).toBeNull();
		}
	}

	expect(state.contributions).toHaveLength(contributions.count);
	for (const contribution of state.contributions) {
		expect(contribution).toMatchObject({
			...(contributions.currentContribution === undefined
				? {}
				: {
						current_contribution: contributions.currentContribution,
					}),
			...(contributions.nextCycleContribution === undefined
				? {}
				: {
						next_cycle_contribution: contributions.nextCycleContribution,
					}),
		});

		const sourceCustomerProduct = state.sourceCustomerProducts.find(
			(customerProduct) =>
				customerProduct.id === contribution.source_customer_product_id,
		);
		const sourceCustomerEntitlement =
			sourceCustomerProduct?.customer_entitlements.find(
				(customerEntitlement) =>
					customerEntitlement.id ===
					contribution.source_customer_entitlement_id,
			);
		expect(sourceCustomerProduct).toBeDefined();
		expect(sourceCustomerEntitlement).toBeDefined();
		expect(sourceCustomerEntitlement?.customer_product_id).toBe(
			contribution.source_customer_product_id,
		);
		expect(
			state.pools.some(
				(candidate) => candidate.id === contribution.pooled_balance_id,
			),
		).toBe(true);
	}

	for (const sourceCustomerProductId of contributions.excludedSourceCustomerProductIds ??
		[]) {
		expect(
			state.contributions.some(
				(contribution) =>
					contribution.source_customer_product_id === sourceCustomerProductId,
			),
		).toBe(false);
	}

	const pooledSourceCustomerEntitlements = state.sourceCustomerProducts.flatMap(
		(customerProduct) =>
			customerProduct.customer_entitlements.filter(
				(customerEntitlement) => customerEntitlement.entitlement.pooled,
			),
	);
	expect(pooledSourceCustomerEntitlements).toHaveLength(sources.count);
	for (const sourceCustomerEntitlement of pooledSourceCustomerEntitlements) {
		expect(sourceCustomerEntitlement).toMatchObject({
			is_pooled_balance: false,
			...(sources.balance === undefined ? {} : { balance: sources.balance }),
			...(sources.adjustment === undefined
				? {}
				: { adjustment: sources.adjustment }),
		});
	}

	return state;
};
