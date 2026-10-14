import { expect } from "bun:test";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { timeout } from "@/utils/genUtils.js";
import { getPooledBalanceDbState } from "../../utils/getPooledBalanceDbState.js";

type CombinePoolExpectation = {
	db: DrizzleCli;
	customerId: string;
	featureId: string;
	granted?: number;
	balance?: number;
	unlimited?: boolean;
	/** Competing shares' amounts, in any order. */
	competingContributions?: number[];
	/** Shares that add on top (entity, license or explicitly pooled priced grants). */
	addingContributions?: number[];
	/** Live pools held for the feature; defaults to one. */
	poolCount?: number;
};

const sortAmounts = (amounts: number[]) =>
	[...amounts].sort((left, right) => left - right);

const assertCombinePoolCorrect = async ({
	db,
	customerId,
	featureId,
	granted,
	balance,
	unlimited,
	competingContributions,
	addingContributions,
	poolCount = 1,
}: CombinePoolExpectation) => {
	const state = await getPooledBalanceDbState({ db, customerId });
	const poolEntitlements = state.poolCustomerEntitlements.filter(
		(customerEntitlement) =>
			customerEntitlement.feature_id === featureId &&
			customerEntitlement.expires_at === null,
	);
	expect(poolEntitlements).toHaveLength(poolCount);
	if (poolCount !== 1) return;

	const poolEntitlement = poolEntitlements[0];
	const pool = state.pools.find(
		({ customer_entitlement_id }) =>
			customer_entitlement_id === poolEntitlement.id,
	);
	if (!pool) throw new Error(`No pool row for '${poolEntitlement.id}'.`);

	if (granted !== undefined) expect(pool.granted).toBe(granted);
	if (balance !== undefined) expect(poolEntitlement.balance).toBe(balance);
	if (unlimited !== undefined) {
		expect(Boolean(poolEntitlement.unlimited)).toBe(unlimited);
	}

	const shares = state.contributions.filter(
		({ pooled_balance_id }) => pooled_balance_id === pool.id,
	);
	const amountsOf = (competes: boolean) =>
		sortAmounts(
			shares
				.filter((share) => share.competes === competes)
				.map((share) => share.current_contribution),
		);
	if (competingContributions) {
		expect(amountsOf(true)).toEqual(sortAmounts(competingContributions));
	}
	if (addingContributions) {
		expect(amountsOf(false)).toEqual(sortAmounts(addingContributions));
	}
};

/** The feature's pool in Postgres: totals, unlimited flag and its competing / adding shares. Polls until it holds. */
export const expectCombinePoolCorrect = async ({
	timeoutMs = 20_000,
	...expectation
}: CombinePoolExpectation & { timeoutMs?: number }) => {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			return await assertCombinePoolCorrect(expectation);
		} catch (error) {
			lastError = error;
			await timeout(1000);
		}
	}
	throw lastError;
};
