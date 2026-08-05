/**
 * TDD contract for pooled balances that expire at a CYCLE BOUNDARY rather than
 * immediately.
 *
 * Contract under test:
 *   New behaviors:
 *     - cancel_end_of_cycle leaves the pool live for the rest of the cycle, then
 *       expires it once the cancellation lands at the next invoice.
 *     - Scheduling a downgrade from a pooled plan to a non-pooled plan leaves the
 *       pool live while the downgrade is scheduled, then expires it when the
 *       schedule lands — the incoming plan grants a regular (unpooled) balance.
 *   Side effects:
 *     - pooled_balances: expires_at set only after the boundary, row retained
 *     - customer_entitlements: synthetic pooled row gets expires_at at the boundary
 *     - pooled_balance_contributions: outgoing source's row deleted at the boundary
 *
 * Pre-impl red: nothing expires the pool when the contribution is removed at a
 * cycle boundary, so expires_at stays null and the dead pool keeps reporting a
 * balance.
 * Post-impl green: the boundary transition removes the last contribution and
 * execution expires the emptied pool.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const POOLED_GRANT = 100;
const REGULAR_GRANT = 40;
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

const MONTHLY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Subscription,
	stripeSubscriptionId: "stripe_subscription",
} as const;

/** The boundary transition lands via webhook, so the expiry settles async. */
const waitForPoolExpired = async ({
	db,
	customerId,
}: {
	db: DrizzleCli;
	customerId: string;
}) => {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	let state = await getPooledBalanceDbState({ db, customerId });

	while (Date.now() < deadline) {
		const allExpired =
			state.poolCustomerEntitlements.length > 0 &&
			state.poolCustomerEntitlements.every(
				(customerEntitlement) => customerEntitlement.expires_at !== null,
			);
		if (allExpired && state.contributions.length === 0) return state;

		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		state = await getPooledBalanceDbState({ db, customerId });
	}

	return state;
};

test.concurrent(
	chalk.yellowBright(
		"pooled expiry: cancel_end_of_cycle keeps the pool live until the cycle ends",
	),
	async () => {
		const customerId = "pooled-expire-end-of-cycle";
		const plan = products.pro({
			id: "pooled-expire-eoc-plan",
			items: [
				{
					...items.monthlyMessages({ includedUsage: POOLED_GRANT }),
					pooled: true,
				},
			],
		});

		const { entities, autumnV2_3, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success", testClock: true }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [plan] }),
				],
				actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
			});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: POOLED_GRANT,
				adjustment: 0,
				granted: POOLED_GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: { count: 1 },
			sources: { count: 1, balance: 0, adjustment: 0 },
		});

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_end_of_cycle",
		});

		// ── Contract: still live while merely scheduled to cancel ────────
		const whileCanceling = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(whileCanceling.contributions).toHaveLength(1);
		expect(whileCanceling.poolCustomerEntitlements[0].expires_at).toBeNull();
		expect(whileCanceling.pools[0].expires_at).toBeNull();

		if (!testClockId) throw new Error("Expected a Stripe test clock");
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
		});

		// ── Contract: expires once the cancellation actually lands ───────
		const afterCycle = await waitForPoolExpired({ db: ctx.db, customerId });
		expect(afterCycle.contributions).toHaveLength(0);
		expect(afterCycle.pools).toHaveLength(1);
		expect(afterCycle.poolCustomerEntitlements[0].expires_at).not.toBeNull();
		expect(afterCycle.pools[0].expires_at).not.toBeNull();

		// Expiry is stamped with the test clock's simulated time, which is ahead of
		// wall clock, so the read filters don't hide it yet. Immediate-expiry
		// invisibility is covered by pooled-balance-expire-last-contribution.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances?.[TestFeature.Messages]?.granted).toBe(0);
		expect(customer.balances?.[TestFeature.Messages]?.remaining).toBe(0);
	},
);

test.concurrent(
	chalk.yellowBright(
		"pooled expiry: scheduled downgrade to a non-pooled plan expires the pool at the boundary",
	),
	async () => {
		const customerId = "pooled-expire-scheduled-downgrade";
		const premium = products.premium({
			id: "pooled-expire-downgrade-premium",
			items: [
				{
					...items.monthlyMessages({ includedUsage: POOLED_GRANT }),
					pooled: true,
				},
			],
		});
		// Incoming plan grants a REGULAR balance — nothing feeds the pool after.
		const pro = products.pro({
			id: "pooled-expire-downgrade-pro",
			items: [items.monthlyMessages({ includedUsage: REGULAR_GRANT })],
		});

		const { entities, autumnV2_3, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success", testClock: true }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [premium, pro] }),
				],
				actions: [s.billing.attach({ productId: premium.id, entityIndex: 0 })],
			});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: POOLED_GRANT,
				adjustment: 0,
				granted: POOLED_GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: { count: 1 },
			sources: { count: 1, balance: 0, adjustment: 0 },
		});

		// Downgrade schedules rather than applying immediately.
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		// ── Contract: pool survives while the downgrade is only scheduled ─
		const whileScheduled = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(whileScheduled.contributions).toHaveLength(1);
		expect(whileScheduled.poolCustomerEntitlements[0].expires_at).toBeNull();
		expect(whileScheduled.pools[0].expires_at).toBeNull();

		if (!testClockId) throw new Error("Expected a Stripe test clock");
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
		});

		// ── Contract: pool expires when the schedule lands ───────────────
		const afterTransition = await waitForPoolExpired({
			db: ctx.db,
			customerId,
		});
		expect(afterTransition.contributions).toHaveLength(0);
		expect(afterTransition.pools).toHaveLength(1);
		expect(
			afterTransition.poolCustomerEntitlements[0].expires_at,
		).not.toBeNull();
		expect(afterTransition.pools[0].expires_at).not.toBeNull();

		// ── Contract: the regular balance from the incoming plan is visible ─
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances?.[TestFeature.Messages]?.remaining).toBe(
			REGULAR_GRANT,
		);
	},
);
