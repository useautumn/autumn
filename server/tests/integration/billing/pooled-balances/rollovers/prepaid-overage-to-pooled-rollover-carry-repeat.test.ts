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

const regrantCustomization = {
	remove_items: [{ feature_id: TestFeature.Credits }],
	add_items: [pooledCreditsItem({ included: POOLED_GRANT_INCREASED })],
};

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
