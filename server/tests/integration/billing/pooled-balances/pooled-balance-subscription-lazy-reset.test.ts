/**
 * TDD contract for lazy/cron reset ownership of subscription-mode pooled
 * balances. A pool whose reset interval is shorter than its subscription's
 * invoice cadence (e.g. a monthly pool on an annual sub) previously never
 * reset — invoice.created was its only trigger.
 *
 * Contract under test:
 *   New behaviors:
 *     - overdue subscription-mode pool resets on customer read (lazy path):
 *       balance -> pooled_balances.granted, next_reset_at advances past now;
 *     - the V1 cron loader (CusEntService.getActiveResetPassed) selects
 *       overdue subscription-mode pools and resetCustomerEntitlement resets
 *       them to the pooled grant;
 *     - the pool keeps reset_mode 'subscription' and its Stripe sub linkage —
 *       only the reset trigger widens, invoice.created remains a valid
 *       (now redundant) reset path.
 *   Side effects:
 *     - synthetic pool customer entitlements are no longer stamped
 *       reset_by_invoice = true at attach, so the batch-reset scan sees them.
 *
 * Pre-impl red: the lazy filter and both cron loaders skip pools whose
 * reset_mode !== 'lazy', and initPooledBalanceGraph stamps reset_by_invoice.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	customerEntitlements,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { resetCustomerEntitlement } from "@/cron/resetCron/resetCustomerEntitlement.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { expectPooledBalanceCorrect } from "./utils/expectPooledBalanceCorrect.js";
import { expirePooledBalanceForReset } from "./utils/expirePooledBalanceForReset.js";
import { getPooledBalanceDbState } from "./utils/getPooledBalanceDbState.js";

const attachAnnualPooledPlan = async ({
	customerId,
	grant,
	trackedUsage,
}: {
	customerId: string;
	grant: number;
	trackedUsage: number;
}) => {
	const pooledPlan = products.proAnnual({
		id: `${customerId}-plan`,
		items: [
			{ ...items.monthlyMessages({ includedUsage: grant }), pooled: true },
		],
	});

	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [pooledPlan] }),
		],
		actions: [
			s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
			s.track({
				featureId: TestFeature.Messages,
				value: trackedUsage,
				entityIndex: 1,
				timeout: 2_000,
			}),
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("pooled reset: overdue subscription pool on an annual sub resets on read")}`,
	async () => {
		const customerId = "pooled-sub-lazy-annual";
		const grant = 500;
		const { autumnV2_2, ctx } = await attachAnnualPooledPlan({
			customerId,
			grant,
			trackedUsage: 200,
		});

		// ── Contract: pool cusEnt is not stamped reset_by_invoice at attach ──
		const attachedState = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(
			attachedState.poolCustomerEntitlements[0]?.reset_by_invoice,
		).not.toBe(true);

		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Subscription,
		});

		// ── Contract: overdue subscription pool resets on customer read ──
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: grant,
			remaining: grant,
			usage: 0,
		});

		// ── Contract: pool keeps subscription mode + Stripe sub linkage ──
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: grant,
				adjustment: 0,
				granted: grant,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Subscription,
				stripeSubscriptionId: "stripe_subscription",
				rollovers: [],
			},
			contributions: { count: 1, currentContribution: grant },
			sources: { count: 1, balance: 0, adjustment: 0 },
		});

		// ── Contract: next_reset_at catches up past now in a single reset ──
		const resetState = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(
			resetState.poolCustomerEntitlements[0]?.next_reset_at,
		).toBeGreaterThan(Date.now());
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled reset: cron loader selects and resets an overdue subscription pool")}`,
	async () => {
		const customerId = "pooled-sub-lazy-cron";
		const grant = 400;
		const { ctx } = await attachAnnualPooledPlan({
			customerId,
			grant,
			trackedUsage: 150,
		});

		const { pooledCustomerEntitlement } = await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Subscription,
		});

		// ── Contract: cron loader includes the overdue subscription pool ──
		const resettable = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: Date.now(),
		});
		const cronCustomerEntitlement = resettable.find(
			(candidate) => candidate.id === pooledCustomerEntitlement.id,
		);
		if (!cronCustomerEntitlement) {
			throw new Error(
				"Expected cron to return the subscription pooled balance",
			);
		}

		// ── Contract: cron reset refills to the pooled grant ──
		await resetCustomerEntitlement({
			ctx,
			cusEnt: cronCustomerEntitlement,
			updatedCusEnts: [],
		});
		const afterReset = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, pooledCustomerEntitlement.id),
		});
		expect(afterReset?.balance).toBe(grant);
		expect(afterReset?.next_reset_at).toBeGreaterThan(Date.now());
	},
);
