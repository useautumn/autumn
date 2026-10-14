import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	customerEntitlements,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import {
	findResetEligibleRow,
	runResetOnCustomerEntitlement,
} from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
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

		if (isBalanceWorkerRoute())
			await flushBalanceWorkerCustomer({ ctx, customerId });
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

		expect(
			await findResetEligibleRow({
				ctx,
				customerEntitlementId: pooledCustomerEntitlement.id,
			}),
			"Expected the cron scan to select the subscription pooled balance",
		).not.toBeNull();

		await runResetOnCustomerEntitlement({
			ctx,
			customerId,
			customerEntitlementId: pooledCustomerEntitlement.id,
		});
		const afterReset = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, pooledCustomerEntitlement.id),
		});
		expect(afterReset?.balance).toBe(grant);
		expect(afterReset?.next_reset_at).toBeGreaterThan(Date.now());
	},
);
