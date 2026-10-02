import { describe, expect, test } from "bun:test";
import { getApiBalances } from "@api/customers/cusFeatures";
import type { FullCustomer } from "@autumn/shared";
import { customerToScopedBalances } from "@/internal/billing/v2/actions/setPlans/preview/balances/customerToScopedBalances";
import { attributePooledBalance } from "@/internal/billing/v2/pooledBalances/attribution/attributePooledBalances";
import {
	ctx,
	customerWithPools,
	entityA,
	entityB,
	entityRow,
	pooledCreditsPlan,
} from "./pooledCreditsFixtures";

const onSubscription = ({
	row,
	stripeSubscriptionId,
}: {
	row: ReturnType<typeof entityRow>;
	stripeSubscriptionId: string;
}) => ({ ...row, subscription_ids: [stripeSubscriptionId] });

const usePool = ({
	fullCustomer,
	stripeSubscriptionId,
	usage,
}: {
	fullCustomer: FullCustomer;
	stripeSubscriptionId: string;
	usage: number;
}) => {
	const pool = fullCustomer.pooled_customer_entitlements?.find(
		(customerEntitlement) =>
			customerEntitlement.pooled_balance?.stripe_subscription_id ===
			stripeSubscriptionId,
	);
	if (!pool) throw new Error(`no pool on ${stripeSubscriptionId}`);
	pool.balance = (pool.balance ?? 0) - usage;
};

const scopedCredits = async (fullCustomer: FullCustomer) =>
	(await customerToScopedBalances({ ctx, fullCustomer })).map(
		({ scope, balances }) =>
			`${scope.entityId ?? "customer"}: ${balances.credits?.granted ?? "none"} granted, ${balances.credits?.remaining ?? "none"} left`,
	);

describe("set_plans balance preview: pooled attribution", () => {
	test("each contributor shares only the usage of the pool it feeds", async () => {
		const enterprise = pooledCreditsPlan({
			planId: "enterprise",
			pooledAllowance: 10_000,
		});
		const scale = pooledCreditsPlan({
			planId: "scale",
			pooledAllowance: 30_000,
		});
		const fullCustomer = customerWithPools([
			onSubscription({
				row: entityRow({
					product: enterprise.product,
					entity: entityA,
					rowId: "cp_enterprise_a",
				}),
				stripeSubscriptionId: "sub_a",
			}),
			onSubscription({
				row: entityRow({
					product: scale.product,
					entity: entityB,
					rowId: "cp_scale_b",
				}),
				stripeSubscriptionId: "sub_b",
			}),
		]);
		usePool({ fullCustomer, stripeSubscriptionId: "sub_a", usage: 4000 });

		expect(await scopedCredits(fullCustomer)).toEqual([
			"customer: none granted, none left",
			"ent_a: 10000 granted, 6000 left",
			"ent_b: 30000 granted, 30000 left",
		]);
	});

	test("a pool granting more than its contributions, as rollovers do, still splits all its remaining and usage", async () => {
		const enterprise = pooledCreditsPlan({
			planId: "enterprise",
			pooledAllowance: 10_000,
		});
		const fullCustomer = customerWithPools([
			entityRow({
				product: enterprise.product,
				entity: entityA,
				rowId: "cp_enterprise_a",
			}),
			entityRow({
				product: enterprise.product,
				entity: entityB,
				rowId: "cp_enterprise_b",
			}),
		]);
		const [pool] = fullCustomer.pooled_customer_entitlements ?? [];
		if (!pool) throw new Error("no pool");
		pool.adjustment = (pool.adjustment ?? 0) + 5000;
		pool.balance = (pool.balance ?? 0) + 5000;

		const scoped = await customerToScopedBalances({ ctx, fullCustomer });
		const { balances: aggregate } = await getApiBalances({
			ctx,
			fullCus: fullCustomer,
		});
		const summedRemaining = scoped.reduce(
			(total, { balances }) => total + (balances.credits?.remaining ?? 0),
			0,
		);

		expect(aggregate.credits?.granted).toBe(25_000);
		expect(summedRemaining).toBe(aggregate.credits?.remaining);
		expect(await scopedCredits(fullCustomer)).toEqual([
			"customer: none granted, none left",
			"ent_a: 10000 granted, 12500 left",
			"ent_b: 10000 granted, 12500 left",
		]);
	});

	test("a contributor to an unlimited pool with overage keeps the pool's access", () => {
		expect(
			attributePooledBalance({
				own: undefined,
				contribution: { poolId: "pool_1", contribution: 0, nextResetAt: null },
				pool: {
					granted: 0,
					remaining: 0,
					usage: 0,
					unlimited: true,
					overage_allowed: true,
				},
				poolContributions: 0,
			}),
		).toMatchObject({ unlimited: true, overage_allowed: true });
	});
});
