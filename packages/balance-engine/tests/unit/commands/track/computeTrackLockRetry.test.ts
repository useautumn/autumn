/**
 * A lock id retried while its lock is open (D2). From the API, the same terms are the same lock, so the retry is allowed
 * and moves nothing, and any other terms are a conflict. From an Atom, which already answered its client, it moves nothing.
 */

import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	LockTermsConflictError,
	type SubjectState,
	type TrackCommand,
	type WorkerLock,
} from "../../../../src/balanceEngine.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
	occurredAt,
} from "../../engineFixtures.js";

const lockedTrack = ({
	value = 8,
	overageBehavior = "reject",
	expiresAt = occurredAt + 86_400_000,
	expiryAction = "confirm",
	id = "lck_1",
}: {
	value?: number;
	overageBehavior?: TrackCommand["overageBehavior"];
	expiresAt?: number;
	expiryAction?: "confirm" | "release";
	id?: string;
} = {}): TrackCommand => ({
	...createTrackCommand({ value, commandId: `cmd_${id}` }),
	overageBehavior,
	lock: { id, lockId: "L1", expiresAt, expiryAction },
});

/** A customer holding lock L1 over 8, and Autumn's row for it. */
const opened = (): { state: SubjectState; heldLock: WorkerLock } => {
	const state = createState();
	const mutation = computeTrack({
		fullSubject: createSubjectFor({ state }),
		command: lockedTrack(),
	});
	const insert = mutation.changes.find((change) => change.table === "locks");
	if (insert?.table !== "locks" || insert.op !== "insert")
		throw new Error("Expected the track to open a lock");
	return { state: applyMutation({ state, mutation }), heldLock: insert.row };
};

const retry = ({
	state,
	command,
	heldLock,
}: {
	state: SubjectState;
	command: TrackCommand;
	heldLock: WorkerLock | null;
}) =>
	computeTrack({ fullSubject: createSubjectFor({ state }), command, heldLock });

const balanceOf = ({ state }: { state: SubjectState }) =>
	state.customerEntitlements[0]?.balance;

describe("a lock id retried while its lock is open", () => {
	test.concurrent("the lock row records the value it was taken for", () => {
		expect(opened().heldLock.value).toBe(8);
	});

	test.concurrent(
		"with the same terms, it is allowed and moves nothing: no deduction, no second row",
		() => {
			const { state, heldLock } = opened();

			const mutation = retry({
				state,
				command: lockedTrack({ id: "lck_retry" }),
				heldLock,
			});

			expect(mutation.result).toMatchObject({ status: "applied" });
			expect(mutation.changes).toEqual([]);
			expect(balanceOf({ state: applyMutation({ state, mutation }) })).toBe(
				balanceOf({ state }),
			);
		},
	);

	test.concurrent(
		"handed in by an Atom, on any terms and with no row to compare, it moves nothing and only its seq lands",
		() => {
			const { state } = opened();

			const mutation = retry({
				state,
				command: {
					...lockedTrack({ id: "lck_retry", value: 9 }),
					source: { atomId: "atom_1", writerId: "w_1", seq: 3 },
				},
				heldLock: null,
			});

			expect(mutation.changes).toEqual([
				expect.objectContaining({
					table: "customer",
					after: { atom_seqs: { atom_1: { w_1: 3 } } },
				}),
			]);
		},
	);

	test.concurrent(
		"with any term different, from the API or an Atom that names the row, or from the API with no row to compare, it is a conflict",
		() => {
			const { state, heldLock } = opened();
			const conflicts: {
				command: TrackCommand;
				heldLock: WorkerLock | null;
			}[] = [
				{ command: lockedTrack({ value: 9 }), heldLock },
				{
					command: lockedTrack({ overageBehavior: "overflow" }),
					heldLock,
				},
				{
					command: lockedTrack({
						expiresAt: occurredAt + 60_000,
						expiryAction: "release",
					}),
					heldLock,
				},
				{
					command: lockedTrack(),
					heldLock: { ...heldLock, feature_id: "words" },
				},
				{
					command: lockedTrack(),
					heldLock: { ...heldLock, entity_id: "ent_1" },
				},
				{
					command: lockedTrack(),
					heldLock: { ...heldLock, customer_id: "cus_2" },
				},
				{ command: lockedTrack(), heldLock: { ...heldLock, value: null } },
				{ command: lockedTrack(), heldLock: { ...heldLock, id: "lck_stale" } },
				{ command: lockedTrack(), heldLock: null },
				{
					command: {
						...lockedTrack({ value: 9 }),
						source: { atomId: "atom_1", writerId: "w_1", seq: 3 },
					},
					heldLock,
				},
			];
			for (const conflict of conflicts)
				expect(() => retry({ state, ...conflict })).toThrow(
					new LockTermsConflictError({ lockId: "L1" }),
				);
		},
	);

	test.concurrent(
		"with no expiry of its own, the lock's expiry is not a term",
		() => {
			const { state, heldLock } = opened();

			const mutation = retry({
				state,
				command: lockedTrack({ expiresAt: occurredAt + 999 }),
				heldLock,
			});

			expect(mutation.result).toMatchObject({ status: "applied" });
		},
	);
});
