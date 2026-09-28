import { describe, expect, test } from "bun:test";
import { PooledBalanceResetMode } from "@autumn/shared";
import {
	catalogRowsToCatalog,
	computeCheck,
	computeTrack,
	createSubjectState,
	type SubjectState,
	subjectStateToFullSubject,
	type WorkerCustomerEntitlement,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogRowsFor,
	createCheckCommand,
	createCustomerEntitlement,
	createPooledBalance,
	createTrackCommand,
	entity,
	identity,
} from "../../engineFixtures.js";

/**
 * A pool is one customer-level row every entity draws from; its grant lives on pooled_balances, not
 * on its synthetic entitlement (allowance 0). Sources never reach the worker.
 */

const POOL_ID = "pb_1";
const POOL_ROW_ID = "pool_ce";

const poolRow = ({
	balance,
}: {
	balance: number;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id: POOL_ROW_ID, balance }),
	customer_product_id: null,
	is_pooled_balance: true,
	pooled_balance_id: POOL_ID,
});

const pooledState = ({
	granted,
	balance = granted,
	withEntity = false,
}: {
	granted: number;
	balance?: number;
	withEntity?: boolean;
}): SubjectState =>
	createSubjectState({
		identity: { ...identity, entityId: withEntity ? entity.id : null },
		customerEntitlements: [poolRow({ balance })],
		pooledBalances: [
			createPooledBalance({
				id: POOL_ID,
				customerEntitlementId: POOL_ROW_ID,
				granted,
				resetMode: PooledBalanceResetMode.Subscription,
			}),
		],
		entity: withEntity ? entity : null,
	});

/** The catalog as billing mints it for a pool: a synthetic entitlement with no product and no allowance of its own. */
const pooledSubjectFor = ({ state }: { state: SubjectState }) =>
	subjectStateToFullSubject({
		state,
		catalog: catalogRowsToCatalog({
			rows: createCatalogRowsFor({ state }).map((row) =>
				row.table === "entitlements"
					? {
							...row,
							row: {
								...row.row,
								pooled: true,
								allowance: 0,
								internal_product_id: null,
							},
						}
					: row,
			),
		}),
		entityId: state.identity.entityId,
	});

describe("pooled balances", () => {
	test("the pool is its own bucket, joined with its grant", () => {
		const subject = pooledSubjectFor({ state: pooledState({ granted: 300 }) });

		expect(subject.extra_customer_entitlements).toEqual([]);
		expect(subject.pooled_customer_entitlements).toHaveLength(1);
		expect(subject.pooled_customer_entitlements[0]).toMatchObject({
			id: POOL_ROW_ID,
			is_pooled_balance: true,
			pooled_balance: { id: POOL_ID, granted: 300, unlimited: false },
		});
	});

	test("a customer track draws from the pool", () => {
		const mutation = computeTrack({
			fullSubject: pooledSubjectFor({ state: pooledState({ granted: 300 }) }),
			command: createTrackCommand({ value: 120, overageBehavior: "reject" }),
		});

		expect(mutation.result).toMatchObject({
			type: "track",
			status: "applied",
			// The pool has no plan behind it, so the deduction names none.
			deductions: [{ balance_id: POOL_ROW_ID, plan_id: null, value: 120 }],
			internalProductId: null,
		});
		expect(
			mutation.changes.map((change) =>
				change.op === "increment" ? { id: change.id, add: change.add } : change,
			),
		).toEqual([{ id: POOL_ROW_ID, add: { balance: -120 } }]);
	});

	test("an entity track draws from the customer's pool, whichever entity tracks", () => {
		const mutation = computeTrack({
			fullSubject: pooledSubjectFor({
				state: pooledState({ granted: 300, withEntity: true }),
			}),
			command: createTrackCommand({
				value: 120,
				overageBehavior: "reject",
				entityId: entity.id,
			}),
		});

		expect(mutation.result).toMatchObject({ type: "track", status: "applied" });
		expect(
			mutation.changes.find((change) => change.op === "increment"),
		).toMatchObject({ id: POOL_ROW_ID, add: { balance: -120 } });
	});

	test("a check reads the pool's grant off pooled_balances, not the entitlement", () => {
		const state = pooledState({ granted: 300, balance: 180 });

		const allowed = computeCheck({
			fullSubject: pooledSubjectFor({ state }),
			command: createCheckCommand({ requiredBalance: 180 }),
		});
		const refused = computeCheck({
			fullSubject: pooledSubjectFor({ state }),
			command: createCheckCommand({ requiredBalance: 181 }),
		});

		expect(allowed.allowed).toBe(true);
		expect(refused.allowed).toBe(false);
		expect(refused.limitType).toBe("included");
	});

	test("a track past the pool is rejected, and nothing moves", () => {
		const mutation = computeTrack({
			fullSubject: pooledSubjectFor({ state: pooledState({ granted: 300 }) }),
			command: createTrackCommand({ value: 301, overageBehavior: "reject" }),
		});

		expect(mutation.result).toMatchObject({
			type: "track",
			status: "rejected",
			reason: "insufficient_balance",
		});
		expect(mutation.changes).toEqual([]);
	});
});
