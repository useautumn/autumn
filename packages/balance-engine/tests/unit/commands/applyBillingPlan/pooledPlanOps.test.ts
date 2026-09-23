import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanCommand,
	applyBillingPlanToSubjects,
	applyMutation,
	computeApplyBillingPlan,
	createSubjectState,
	StaleMutationError,
	type SubjectState,
	toBillingPlanDeleteOp,
	toBillingPlanIncrementOp,
	toBillingPlanInsertOp,
	toBillingPlanUpdateOp,
	type WorkerPooledContribution,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createEntityState,
	createPooledBalance,
	entity,
	identity,
} from "../../engineFixtures.js";

const POOL_ID = "pool_1";
const POOL_CE_ID = "pool_ce";
const NOW = 1_700_000_000_000;

const customerRow = {
	internal_id: "cus_internal_1",
	id: identity.customerId,
	config: null,
	spend_limits: null,
	overage_allowed: null,
	usage_limits: null,
	currency: null,
};

const poolRow = ({ balance = 0 }: { balance?: number } = {}) => ({
	...createCustomerEntitlement({ id: POOL_CE_ID, balance }),
	customer_product_id: null,
	is_pooled_balance: true,
	pooled_balance_id: POOL_ID,
	pooled_contribution_id: null,
});

const sourceRow = ({
	id = "source_1",
	balance = 100,
	pooledContributionId = null,
}: {
	id?: string;
	balance?: number;
	pooledContributionId?: string | null;
} = {}) => ({
	...createCustomerEntitlement({ id, balance }),
	pooled_contribution_id: pooledContributionId,
});

const contribution = ({
	id = "pbc_1",
	sourceId = "source_1",
	current = 100,
}: {
	id?: string;
	sourceId?: string;
	current?: number;
} = {}): WorkerPooledContribution => ({
	id,
	pooled_balance_id: POOL_ID,
	source_customer_product_id: "cp_1",
	source_customer_entitlement_id: sourceId,
	current_contribution: current,
	next_cycle_contribution: current,
	effective_at: null,
	created_at: 1,
	updated_at: 1,
});

const planOf = ({
	ops,
	entityIds = [],
	expiringPooledBalanceIds = [],
}: {
	ops: ApplyBillingPlanCommand["ops"];
	entityIds?: string[];
	expiringPooledBalanceIds?: string[];
}): ApplyBillingPlanCommand => ({
	schemaVersion: 1,
	type: "applyBillingPlan",
	commandId: "plan_pooled",
	requestId: "req_plan_pooled",
	identity,
	occurredAt: NOW,
	entityIds,
	ops,
	expiringPooledBalanceIds,
});

/** The customer holds a product with one grant and nothing pooled yet. */
const heldState = (): SubjectState =>
	createSubjectState({
		identity,
		customer: customerRow,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [sourceRow()],
	});

/** The customer already holds a pool of 100 fed by source_1. */
const pooledState = ({
	customerLicenseLinkId = null,
}: {
	customerLicenseLinkId?: string | null;
} = {}): SubjectState =>
	createSubjectState({
		identity,
		customer: customerRow,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			poolRow({ balance: 100 }),
			sourceRow({ pooledContributionId: "pbc_1" }),
		],
		pooledBalances: [
			createPooledBalance({
				id: POOL_ID,
				granted: 100,
				customerLicenseLinkId,
			}),
		],
	});

const summarize = (changes: { table: string; op: string }[]) =>
	changes.map(({ table, op }) => `${op}:${table}`);

const removeShare = () =>
	toBillingPlanDeleteOp({
		table: "pooledContributions",
		id: "pbc_1",
		share: {
			pooledBalanceId: POOL_ID,
			sourceCustomerEntitlementId: "source_1",
		},
	});

describe("a plan's pooled ops", () => {
	test("a new pool: the rows land as sent, the share is carried, and its source is zeroed", () => {
		const state = heldState();
		const mutation = computeApplyBillingPlan({
			command: planOf({
				ops: [
					toBillingPlanInsertOp({
						table: "customerEntitlements",
						row: poolRow({ balance: 100 }),
					}),
					toBillingPlanInsertOp({
						table: "pooledBalances",
						row: createPooledBalance({ id: POOL_ID, granted: 100 }),
					}),
					toBillingPlanInsertOp({
						table: "pooledContributions",
						row: contribution(),
					}),
				],
			}),
			state,
		});
		expect(summarize(mutation.changes)).toEqual([
			"insert:customerEntitlements",
			"insert:pooledBalances",
			"insert:pooledContributions",
			"update:customerEntitlements",
		]);
		const next = applyMutation({ state, mutation });
		expect(next.pooledBalances[0]?.granted).toBe(100);
		expect(
			next.customerEntitlements.map(
				({ id, balance, pooled_contribution_id }) => [
					id,
					balance,
					pooled_contribution_id ?? null,
				],
			),
		).toEqual([
			["source_1", 0, "pbc_1"],
			[POOL_CE_ID, 100, null],
		]);
	});

	test("the pool's totals move by the plan's own deltas, and its lifecycle columns are set", () => {
		const state = pooledState();
		const next = applyMutation({
			state,
			mutation: computeApplyBillingPlan({
				command: planOf({
					ops: [
						toBillingPlanIncrementOp({ id: POOL_CE_ID, add: { balance: 50 } }),
						toBillingPlanIncrementOp({
							table: "pooledBalances",
							id: POOL_ID,
							add: { granted: 50 },
						}),
						toBillingPlanUpdateOp({
							table: "pooledBalances",
							id: POOL_ID,
							set: { stripe_subscription_id: "sub_1" },
						}),
					],
				}),
				state,
			}),
		});
		expect(next.pooledBalances[0]).toMatchObject({
			granted: 150,
			stripe_subscription_id: "sub_1",
		});
		expect(
			next.customerEntitlements.find(({ id }) => id === POOL_CE_ID)?.balance,
		).toBe(150);
	});

	test("a share changed is carried whole; a share removed releases its source", () => {
		const state = pooledState();
		const mutation = computeApplyBillingPlan({
			command: planOf({
				ops: [
					toBillingPlanUpdateOp({
						table: "pooledContributions",
						id: "pbc_1",
						set: { next_cycle_contribution: 50, effective_at: NOW + 1 },
					}),
					removeShare(),
				],
			}),
			state,
		});
		expect(mutation.changes).toEqual([
			{
				table: "pooledContributions",
				op: "update",
				id: "pbc_1",
				before: {},
				after: { next_cycle_contribution: 50, effective_at: NOW + 1 },
			},
			{ table: "pooledContributions", op: "delete", id: "pbc_1" },
			{
				table: "customerEntitlements",
				op: "update",
				id: "source_1",
				before: { pooled_contribution_id: "pbc_1" },
				after: { pooled_contribution_id: null },
			},
		]);
		expect(
			applyMutation({ state, mutation }).customerEntitlements.find(
				({ id }) => id === "source_1",
			)?.pooled_contribution_id,
		).toBeNull();
	});

	test("a share removed with its product needs no release: the plan already deleted the source", () => {
		const state = pooledState();
		const mutation = computeApplyBillingPlan({
			command: planOf({
				ops: [
					toBillingPlanDeleteOp({ table: "customerProducts", id: "cp_1" }),
					removeShare(),
				],
			}),
			state,
		});
		expect(summarize(mutation.changes)).toEqual([
			"delete:customerEntitlements",
			"delete:customerProducts",
			"delete:pooledContributions",
		]);
	});

	test("the pools the worker found empty expire with their rows; a license pool does not", () => {
		const expiring = computeApplyBillingPlan({
			command: planOf({
				ops: [removeShare()],
				expiringPooledBalanceIds: [POOL_ID],
			}),
			state: pooledState(),
		});
		expect(expiring.changes.slice(-2)).toEqual([
			{
				table: "pooledBalances",
				op: "update",
				id: POOL_ID,
				before: { expires_at: null },
				after: { expires_at: NOW },
			},
			{
				table: "customerEntitlements",
				op: "update",
				id: POOL_CE_ID,
				before: { expires_at: null },
				after: { expires_at: NOW },
			},
		]);

		const licensePool = computeApplyBillingPlan({
			command: planOf({
				ops: [removeShare()],
				expiringPooledBalanceIds: [POOL_ID],
			}),
			state: pooledState({ customerLicenseLinkId: "link_1" }),
		});
		expect(summarize(licensePool.changes)).toEqual([
			"delete:pooledContributions",
			"update:customerEntitlements",
		]);
	});

	test("a rolled-back pool graph leaves: the pool row and POOL_CE are deleted", () => {
		const state = pooledState();
		const next = applyMutation({
			state,
			mutation: computeApplyBillingPlan({
				command: planOf({
					ops: [
						toBillingPlanDeleteOp({ table: "pooledBalances", id: POOL_ID }),
						toBillingPlanDeleteOp({
							table: "customerEntitlements",
							id: POOL_CE_ID,
						}),
					],
				}),
				state,
			}),
		});
		expect(next.pooledBalances).toEqual([]);
		expect(next.customerEntitlements.map(({ id }) => id)).toEqual(["source_1"]);
	});

	test("a share whose source the worker cannot see, or that already contributes, is stale", () => {
		const stale = (ops: ApplyBillingPlanCommand["ops"], state: SubjectState) =>
			expect(() =>
				computeApplyBillingPlan({ command: planOf({ ops }), state }),
			).toThrow(StaleMutationError);
		stale(
			[
				toBillingPlanInsertOp({
					table: "pooledContributions",
					row: contribution({ id: "pbc_2" }),
				}),
			],
			pooledState(),
		);
		stale(
			[
				toBillingPlanInsertOp({
					table: "pooledContributions",
					row: contribution({ sourceId: "source_9" }),
				}),
			],
			heldState(),
		);
		stale([removeShare()], heldState());
	});

	test("a source on an entity: the share and pool land on the customer, the zeroed source on the entity", () => {
		const entityPart = createEntityState({
			customerEntitlements: [
				{
					...sourceRow({ id: "source_ent" }),
					internal_entity_id: entity.internal_id,
				},
			],
		});
		if (!entityPart.entity)
			throw new Error("the entity part carries its entity");
		const { projectedStates } = applyBillingPlanToSubjects({
			command: planOf({
				entityIds: [entity.id],
				ops: [
					toBillingPlanInsertOp({
						table: "customerEntitlements",
						row: poolRow({ balance: 100 }),
					}),
					toBillingPlanInsertOp({
						table: "pooledBalances",
						row: createPooledBalance({ id: POOL_ID, granted: 100 }),
					}),
					toBillingPlanInsertOp({
						table: "pooledContributions",
						row: contribution({ sourceId: "source_ent" }),
					}),
				],
			}),
			customer: createSubjectState({
				identity,
				customer: customerRow,
				customerProducts: [createCustomerProduct()],
			}),
			entityParts: [{ state: entityPart, entity: entityPart.entity }],
		});
		const [customer, entityAfter] = projectedStates;
		expect(customer?.pooledBalances[0]?.granted).toBe(100);
		expect(customer?.customerEntitlements.map(({ id }) => id)).toEqual([
			POOL_CE_ID,
		]);
		expect(entityAfter?.customerEntitlements[0]).toMatchObject({
			id: "source_ent",
			balance: 0,
			pooled_contribution_id: "pbc_1",
		});
	});
});
