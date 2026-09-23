import { describe, expect, test } from "bun:test";
import type { BillingPlanOp } from "@autumn/balance-engine";
import {
	EntInterval,
	type FullCustomerEntitlement,
	type PooledBalance,
	type PooledBalancePlan,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { autumnBillingPlanToCatalogRows } from "@/internal/balanceWorker/billingPlan/autumnBillingPlanToCatalogRows.js";
import { autumnBillingPlanToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/autumnBillingPlanToPlanOps.js";
import { pooledBalancePlanToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/pooledBalances/pooledBalancePlanToPlanOps.js";
import { planOf } from "../../billingPlanFixtures.js";

const poolRow = ({
	id = "pool_1",
	granted = 100,
	customerLicenseLinkId = null,
}: {
	id?: string;
	granted?: number;
	customerLicenseLinkId?: string | null;
} = {}): PooledBalance => ({
	id,
	org_id: "org_test",
	env: "sandbox",
	internal_customer_id: "cus_internal",
	internal_feature_id: "internal_messages",
	unlimited: false,
	granted,
	interval: EntInterval.Month,
	interval_count: 1,
	reset_cycle_anchor: null,
	reset_mode: PooledBalanceResetMode.Lazy,
	stripe_subscription_id: "sub_placeholder",
	customer_license_link_id: customerLicenseLinkId,
	rollover_signature: "",
	customer_entitlement_id: "pool_ce",
	last_applied_reset_at: null,
	expires_at: null,
	created_at: 1,
	updated_at: 1,
});

/** POOL_CE as `initPooledBalanceGraph` mints it, with the pool row beside it. */
const pooledCustomerEntitlement = ({
	balance = 100,
	pooledBalance = poolRow(),
}: {
	balance?: number;
	pooledBalance?: PooledBalance;
} = {}): FullCustomerEntitlement => ({
	...customerEntitlements.create({
		id: "pool_ce",
		featureId: "messages",
		featureName: "Messages",
		allowance: 0,
		balance,
	}),
	customer_product_id: null,
	is_pooled_balance: true,
	pooled_balance_id: pooledBalance.id,
	pooled_contribution_id: null,
	pooled_balance: pooledBalance,
});

const contribution = ({ id = "pbc_1", sourceId = "source_1" } = {}) => ({
	id,
	pooled_balance_id: "pool_1",
	source_customer_product_id: "cp_1",
	source_customer_entitlement_id: sourceId,
	current_contribution: 100,
	next_cycle_contribution: 100,
	effective_at: null,
	created_at: 1,
	updated_at: 1,
});

const emptyPooledPlan = (): PooledBalancePlan => ({
	insertPoolBalances: [],
	updatePoolBalances: [],
	expirePoolBalanceCandidates: [],
	insertPoolRollovers: [],
	insertPoolContributions: [],
	updatePoolContributions: [],
	deletePoolContributions: [],
});

const described = (ops: BillingPlanOp[]) =>
	ops.map((op) =>
		op.op === "insert"
			? `insert:${op.table}:${op.row.id}`
			: `${op.op}:${op.table}:${op.id}`,
	);

describe("pooledBalancePlanToPlanOps", () => {
	test("a new pool: POOL_CE with its balance, the pool row as computed, then the contributions", () => {
		const autumnBillingPlan = planOf({
			pooledBalancePlan: {
				...emptyPooledPlan(),
				insertPoolBalances: [pooledCustomerEntitlement({ balance: 200 })],
				insertPoolContributions: [
					contribution(),
					contribution({ id: "pbc_2", sourceId: "source_2" }),
				],
			},
		});
		const ops = pooledBalancePlanToPlanOps({ autumnBillingPlan });
		expect(described(ops)).toEqual([
			"insert:customerEntitlements:pool_ce",
			"insert:pooledBalances:pool_1",
			"insert:pooledContributions:pbc_1",
			"insert:pooledContributions:pbc_2",
		]);
		expect(ops[0]).toMatchObject({
			row: {
				balance: 200,
				pooled_balance_id: "pool_1",
				customer_product_id: null,
			},
		});
		expect(ops[1]).toMatchObject({ row: { granted: 100 } });
		expect(ops[2]).toMatchObject({
			row: { effective_at: null, current_contribution: 100 },
		});
	});

	test("a held pool: balance and grant move by the plan's deltas, and the lifecycle columns are set", () => {
		const autumnBillingPlan = planOf({
			pooledBalancePlan: {
				...emptyPooledPlan(),
				updatePoolBalances: [
					{
						pooledCustomerEntitlement: pooledCustomerEntitlement(),
						balanceDelta: 50,
						grantedDelta: 50,
					},
				],
				insertPoolContributions: [
					contribution({ id: "pbc_2", sourceId: "source_2" }),
				],
			},
		});
		const ops = pooledBalancePlanToPlanOps({ autumnBillingPlan });
		expect(described(ops)).toEqual([
			"increment:customerEntitlements:pool_ce",
			"update:pooledBalances:pool_1",
			"increment:pooledBalances:pool_1",
			"insert:pooledContributions:pbc_2",
		]);
		expect(ops[0]).toMatchObject({ add: { balance: 50 } });
		expect(ops[2]).toMatchObject({ add: { granted: 50 } });
		expect(ops[1]).toMatchObject({
			set: {
				reset_cycle_anchor: null,
				stripe_subscription_id: "sub_placeholder",
				customer_license_link_id: null,
			},
		});
	});

	test("a share changed is set whole, a share removed names its pool and source, and expiry candidates send nothing", () => {
		const autumnBillingPlan = planOf({
			pooledBalancePlan: {
				...emptyPooledPlan(),
				updatePoolContributions: [
					{ ...contribution(), next_cycle_contribution: 50, effective_at: 2 },
				],
				deletePoolContributions: [
					contribution({ id: "pbc_2", sourceId: "source_2" }),
				],
				expirePoolBalanceCandidates: [
					{
						pooledCustomerEntitlement: pooledCustomerEntitlement(),
						expiresAt: 3,
					},
				],
				deletePoolBalances: [pooledCustomerEntitlement()],
			},
		});
		const ops = pooledBalancePlanToPlanOps({ autumnBillingPlan });
		expect(described(ops)).toEqual([
			"update:pooledContributions:pbc_1",
			"delete:pooledContributions:pbc_2",
			"delete:pooledBalances:pool_1",
			"delete:customerEntitlements:pool_ce",
		]);
		expect(ops[0]).toMatchObject({
			set: {
				next_cycle_contribution: 50,
				effective_at: 2,
				current_contribution: 100,
			},
		});
		expect(ops[1]).toMatchObject({
			pooledBalanceId: "pool_1",
			sourceCustomerEntitlementId: "source_2",
		});
		expect(
			pooledBalancePlanToPlanOps({ autumnBillingPlan: planOf({}) }),
		).toEqual([]);
	});

	test("pooled ops come last in the plan's ops, and the pool's entitlement and feature travel as catalog rows", () => {
		const autumnBillingPlan = planOf({
			pooledBalancePlan: {
				...emptyPooledPlan(),
				insertPoolBalances: [pooledCustomerEntitlement()],
				insertPoolContributions: [contribution()],
			},
		});
		expect(
			described(autumnBillingPlanToPlanOps({ autumnBillingPlan })),
		).toEqual([
			"insert:customerEntitlements:pool_ce",
			"insert:pooledBalances:pool_1",
			"insert:pooledContributions:pbc_1",
		]);
		expect(
			autumnBillingPlanToCatalogRows({ autumnBillingPlan }).map(
				(row) =>
					`${row.table}:${row.table === "features" ? row.row.internal_id : row.row.id}`,
			),
		).toEqual(["entitlements:ent_messages", "features:internal_messages"]);
	});
});
