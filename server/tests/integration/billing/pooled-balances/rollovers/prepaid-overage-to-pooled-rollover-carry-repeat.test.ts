/**
 * TDD contract: a prepaid rollover survives a move onto a POOLED item whose rollover signature does
 * not match the one that minted it (carried amount is capped by the pooled cusEnt's rollover rules).
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import chalk from "chalk";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";
import {
	CARRIED,
	customization,
	expectRolloverCarriedToPool,
	POOLED_GRANT_INCREASED,
	pooledCreditsItem,
	setupPrepaidOverageCredits,
} from "./utils/prepaidOverageRolloverCarry.js";

/** Regrant the already-pooled item, changing nothing else. */
const regrantCustomization = {
	remove_items: [{ feature_id: TestFeature.Credits }],
	add_items: [pooledCreditsItem({ included: POOLED_GRANT_INCREASED })],
};

/**
 * Regression: the carry must be a MOVE, not a copy.
 *
 * Red-failure mode (before fix): the pooled SOURCE cusEnt kept its own copy of
 * the carried rollover. On the next update applyExistingRollovers re-carried
 * that copy onto the new source, and carrySourceRolloversToPool copied it onto
 * the pool again — which is updated in place, so its rows accumulated. A
 * 10k -> 20k regrant turned one 100 row into two (UI: "+200 rollover").
 *
 * Green-success criteria: the pool holds exactly one rollover row no matter how
 * many times the plan is updated afterwards.
 */
test(
	chalk.yellowBright(
		"pooled rollover carry (repeat update): regranting the pooled item does not re-carry the rollover",
	),
	async () => {
		const scenario = await setupPrepaidOverageCredits({
			customerId: "prepaid-overage-to-pooled-repeat",
		});
		const { ctx, customerId, autumnV2_3 } = scenario;

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: scenario.plan.id,
			customize: customization,
		});
		await expectRolloverCarriedToPool({ scenario });

		// Only the grant changes — there is nothing new to carry.
		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: scenario.plan.id,
			customize: regrantCustomization,
		});

		const afterRegrant = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterRegrant.pools).toHaveLength(1);
		expect(afterRegrant.pools[0].granted).toBe(POOLED_GRANT_INCREASED);

		const pooledRollovers =
			afterRegrant.poolCustomerEntitlements[0].rollovers ?? [];
		expect(pooledRollovers).toHaveLength(1);
		expect(pooledRollovers[0].balance).toBe(CARRIED);

		const customerAfterRegrant = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(
			customerAfterRegrant.balances?.[TestFeature.Credits]?.remaining,
		).toBe(POOLED_GRANT_INCREASED + CARRIED);
	},
);
