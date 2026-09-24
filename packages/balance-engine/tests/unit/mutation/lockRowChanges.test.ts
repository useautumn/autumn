import { describe, expect, test } from "bun:test";
import {
	applyChanges,
	mergeSubjectStates,
	parseSubjectState,
	type RowChange,
	StaleMutationError,
	splitSubjectState,
	type WorkerLock,
} from "../../../src/balanceEngine.js";
import { createEntityState, createState, identity } from "../engineFixtures.js";

const createLock = ({
	id = "lck_1",
	lockId = "L1",
}: {
	id?: string;
	lockId?: string;
} = {}): WorkerLock => ({
	id,
	org_id: identity.orgId,
	env: identity.env,
	lock_id: lockId,
	internal_customer_id: identity.customerId,
	customer_id: identity.customerId,
	entity_id: null,
	feature_id: "messages",
	overage_behavior: "reject",
	properties: null,
	deltas: [],
	expires_at: 1_700_000_086_400_000,
	expiry_action: "confirm",
	created_at: 1_700_000_000_000,
});

const insertLock = (lock: WorkerLock): RowChange => ({
	table: "locks",
	op: "insert",
	row: lock,
});

describe("lock row changes", () => {
	test.concurrent("an insert keeps only the lock's ids in memory", () => {
		const state = applyChanges({
			state: createState(),
			changes: [insertLock(createLock())],
		});
		expect(state.openLocks).toEqual([{ id: "lck_1", lock_id: "L1" }]);
	});

	test.concurrent("a second lock under the same lock id is stale", () => {
		const state = applyChanges({
			state: createState(),
			changes: [insertLock(createLock())],
		});
		expect(() =>
			applyChanges({
				state,
				changes: [insertLock(createLock({ id: "lck_2" }))],
			}),
		).toThrow(StaleMutationError);
	});

	test.concurrent("a delete removes the lock, and only once", () => {
		const opened = applyChanges({
			state: createState(),
			changes: [insertLock(createLock())],
		});
		const closed = applyChanges({
			state: opened,
			changes: [{ table: "locks", op: "delete", id: "lck_1" }],
		});
		expect(closed.openLocks).toEqual([]);
		expect(() =>
			applyChanges({
				state: closed,
				changes: [{ table: "locks", op: "delete", id: "lck_1" }],
			}),
		).toThrow(StaleMutationError);
	});

	test.concurrent("the customer's state owns every open lock", () => {
		const entityState = createEntityState();
		const merged = applyChanges({
			state: mergeSubjectStates({
				customer: createState(),
				entity: entityState,
			}),
			changes: [insertLock(createLock())],
		});
		const { customer, entity } = splitSubjectState({ state: merged });
		expect(customer.openLocks).toEqual([{ id: "lck_1", lock_id: "L1" }]);
		expect(entity?.openLocks).toEqual([]);
		expect(mergeSubjectStates({ customer, entity }).openLocks).toEqual([
			{ id: "lck_1", lock_id: "L1" },
		]);
	});

	test.concurrent("a state stored before locks existed has none open", () => {
		const { openLocks: _openLocks, ...stored } = createState();
		expect(parseSubjectState({ input: stored }).openLocks).toEqual([]);
	});
});
