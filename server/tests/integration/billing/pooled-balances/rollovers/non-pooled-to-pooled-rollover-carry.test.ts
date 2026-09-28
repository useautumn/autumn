/**
 * TDD contract: rollovers survive a move from a NON-POOLED balance to a POOLED one.
 *
 * Contract under test:
 *   New behaviors:
 *     - updating a subscription so feature F's non-pooled cusEnt is replaced by a
 *       pooled one carries the outgoing rollover onto the POOLED balance
 *   Side effects:
 *     - the carried rollovers row belongs to the cusEnt that actually holds the
 *       pooled balance (the synthetic pooled cusEnt), not the incoming source
 *       cusEnt, which executePooledBalancePlan zeroes and hides from reads
 *     - the customer's readable balance = pooled granted + carried rollover
 *
 * Pre-impl red: applyExistingRollovers is pooled-unaware — it scores candidates by
 * billing kind / interval / capacity and pushes onto the winning cusEnt, which for
 * a pooled item is the source. The source is then normalised to balance 0 and
 * hidden, stranding the carried rollover.
 * Post-impl green: the carry retargets onto the pooled cusEnt.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { runBatchResetV2 } from "@tests/integration/cron/batch-reset-v2/batchResetV2TestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const GRANT = 100;
const USAGE = 40;
const POOLED_GRANT = 200;

// 50% of GRANT = 50, BELOW the 60 left after usage, so the cap binds and only
// 50 carries — the clamp is what makes this a meaningful carry to assert on.
const CARRIED = GRANT * 0.5;
const rolloverConfig = {
	max_percentage: 50,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

test(
	chalk.yellowBright(
		"pooled rollover carry: a non-pooled balance's rollover survives the move to a pooled one",
	),
	async () => {
		const customerId = "non-pooled-to-pooled-rollover";

		const nonPooledPro = products.pro({
			id: "non-pooled-rollover-pro",
			items: [
				items.monthlyMessagesWithRollover({
					includedUsage: GRANT,
					rolloverConfig,
				}),
			],
		});
		const pooledPro = products.premium({
			id: "pooled-rollover-premium",
			items: [
				{
					...items.monthlyMessagesWithRollover({
						includedUsage: POOLED_GRANT,
						rolloverConfig,
					}),
					pooled: true,
				},
			],
		});

		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [nonPooledPro, pooledPro] }),
			],
			actions: [
				s.billing.attach({ productId: nonPooledPro.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: USAGE,
					entityIndex: 0,
					timeout: 2000,
				}),
			],
		});

		// Force the reset that mints the rollover on the NON-pooled cusEnt. The
		// reset is cron-driven, not lazy, so the worker has to be run explicitly.
		const nonPooledCusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		if (!nonPooledCusEnt) throw new Error("non-pooled cusEnt not found");

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [nonPooledCusEnt.id],
		});
		// skip_cache forces the lazy reset to run off Postgres rather than
		// returning the pre-reset cached balance.
		const customerAfterReset = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		const carriedRollover = CARRIED;
		expect(customerAfterReset.balances?.[TestFeature.Messages]?.remaining).toBe(
			GRANT + carriedRollover,
		);

		const beforeMove = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(beforeMove.pools).toHaveLength(0);

		// ── Move the feature onto a pooled balance ───────────────────────
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPro.id,
			redirect_mode: "if_required",
		});

		const afterMove = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(afterMove.pools).toHaveLength(1);
		expect(afterMove.pools[0].granted).toBe(POOLED_GRANT);

		// ── Contract: the rollover lands on the POOLED cusEnt ────────────
		const pooledCustomerEntitlement = afterMove.poolCustomerEntitlements[0];
		const pooledRollovers = pooledCustomerEntitlement.rollovers ?? [];
		expect(pooledRollovers).toHaveLength(1);
		expect(pooledRollovers[0].balance).toBe(carriedRollover);

		// ── Contract: it is readable, not stranded on the zeroed source ──
		const customerAfterMove = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerAfterMove.balances?.[TestFeature.Messages]?.remaining).toBe(
			POOLED_GRANT + carriedRollover,
		);
	},
);
