import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeFinalize,
	computeTrack,
	type FinalizeCommand,
	LockNotFoundError,
	type SubjectState,
	type WorkerLock,
} from "../../../../src/balanceEngine.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
	identity,
	occurredAt,
	org,
} from "../../engineFixtures.js";

const source = { atomId: "atom_1", writerId: "w_1", seq: 5 };

const balanceOf = ({ state }: { state: SubjectState }) =>
	state.customerEntitlements[0]?.balance;

/** A customer holding `atomSeqs`, with an 8-message lock open. */
const lockedState = ({
	atomSeqs,
}: {
	atomSeqs?: Record<string, Record<string, number>>;
}): { state: SubjectState; lock: WorkerLock } => {
	const initial = createState();
	const state = {
		...initial,
		customer: { ...initial.customer, atom_seqs: atomSeqs },
	};
	const mutation = computeTrack({
		fullSubject: createSubjectFor({ state }),
		command: {
			...createTrackCommand({ value: 8, commandId: "cmd_lock" }),
			lock: {
				id: "lck_1",
				lockId: "L1",
				expiresAt: occurredAt + 86_400_000,
				expiryAction: "confirm",
			},
		},
	});
	const lockChange = mutation.changes.find(
		(change) => change.table === "locks" && change.op === "insert",
	);
	if (lockChange?.table !== "locks" || lockChange.op !== "insert")
		throw new Error("Expected the track to open a lock");
	return { state: applyMutation({ state, mutation }), lock: lockChange.row };
};

const release = ({
	state,
	lock,
	sent,
}: {
	state: SubjectState;
	lock: WorkerLock;
	/** The source the server stamped; null for a finalize the API sent. */
	sent: typeof source | null;
}) => {
	const command: FinalizeCommand = {
		schemaVersion: 1,
		type: "finalize",
		commandId: "cmd_release",
		requestId: "req_release",
		identity,
		occurredAt,
		org,
		lock,
		internalFeatureId: "feat_messages",
		finalValue: 0,
		properties: null,
		...(sent && { source: sent }),
	};
	return computeFinalize({ fullSubject: createSubjectFor({ state }), command });
};

describe("a finalize an Atom handed in", () => {
	test.concurrent(
		"past its journal's held seq, it unwinds the lock and lands the seq",
		() => {
			const { state, lock } = lockedState({ atomSeqs: { atom_1: { w_1: 4 } } });

			const settled = applyMutation({
				state,
				mutation: release({ state, lock, sent: source }),
			});

			expect(balanceOf({ state: settled })).toBe(balanceOf({ state }) + 8);
			expect(settled.openLocks).toEqual([]);
			expect(settled.customer.atom_seqs).toEqual({ atom_1: { w_1: 5 } });
		},
	);

	test.concurrent(
		"at or below its journal's held seq, it is a replay: no row changes, the lock stays",
		() => {
			for (const held of [5, 9]) {
				const { state, lock } = lockedState({
					atomSeqs: { atom_1: { w_1: held } },
				});

				const mutation = release({ state, lock, sent: source });

				expect(mutation.changes).toEqual([]);
				expect(mutation.result).toMatchObject({
					status: "applied",
					deltas: [],
				});
			}
		},
	);

	test.concurrent(
		"on a lock Autumn already settled, it lands only its seq",
		() => {
			const { state: locked, lock } = lockedState({});
			const settled = applyMutation({
				state: locked,
				mutation: release({ state: locked, lock, sent: { ...source, seq: 1 } }),
			});

			const mutation = release({ state: settled, lock, sent: source });

			expect(mutation.changes).toEqual([
				{
					table: "customer",
					op: "update",
					id: settled.customer.internal_id,
					before: {},
					after: { atom_seqs: { atom_1: { w_1: 5 } } },
				},
			]);
		},
	);

	test.concurrent(
		"one the API sent on a settled lock is still not found",
		() => {
			const { state: locked, lock } = lockedState({});
			const settled = applyMutation({
				state: locked,
				mutation: release({ state: locked, lock, sent: null }),
			});

			expect(() => release({ state: settled, lock, sent: null })).toThrow(
				LockNotFoundError,
			);
		},
	);
});
