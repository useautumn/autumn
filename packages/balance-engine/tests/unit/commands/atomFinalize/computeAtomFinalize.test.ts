import { describe, expect, test } from "bun:test";
import {
	type AtomFinalizeCommand,
	applyMutation,
	computeAtomFinalizeDecision,
	computeTrack,
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

const takeLock = ({ state }: { state: SubjectState }) => {
	const mutation = computeTrack({
		fullSubject: createSubjectFor({ state }),
		command: {
			...createTrackCommand({
				value: 30,
				overageBehavior: "reject",
				commandId: "cmd_lock",
			}),
			lock: {
				id: "lck_1",
				lockId: "L1",
				expiresAt: occurredAt + 86_400_000,
				expiryAction: "confirm",
			},
		},
	});
	const change = mutation.changes.find(
		(rowChange) => rowChange.table === "locks" && rowChange.op === "insert",
	);
	if (change?.table !== "locks" || change.op !== "insert")
		throw new Error("Expected the track to open a lock");
	return {
		state: applyMutation({ state, mutation }),
		lock: change.row as WorkerLock,
	};
};

const balanceOf = (state: SubjectState) =>
	state.customerEntitlements.find((row) => row.id === "messages_monthly")
		?.balance;

/** Journaled by the Atom undecided: no entity or feature named, for Autumn's own row to name. */
const undecidedFinalize = ({
	finalValue,
	seq = 2,
}: {
	finalValue: number | null;
	seq?: number;
}): AtomFinalizeCommand => ({
	schemaVersion: 1,
	type: "atomFinalize",
	commandId: "cmd_atom_finalize",
	requestId: "req_atom_finalize",
	identity,
	occurredAt,
	org,
	lockId: "L1",
	featureId: null,
	internalFeatureId: null,
	finalValue,
	properties: null,
	source: { atomId: "atom_1", writerId: "w_1", seq },
});

/** The row as the worker resolves it: with its feature's internal id joined on. */
const readBack = (lock: WorkerLock): WorkerLock => ({
	...lock,
	internal_feature_id: "feat_messages",
});

describe("an Atom's finalize at hand-in", () => {
	test("B1: a confirm above a reject lock the Atom answered is settled as the Atom settled it, even when Autumn's balance has since moved", () => {
		const locked = takeLock({ state: createState({ balance: 100 }) });
		// An API deduction landed in the push lag: 10 left, so 20 more above the lock does not fit.
		const moved: SubjectState = {
			...locked.state,
			customerEntitlements: locked.state.customerEntitlements.map((row) =>
				row.id === "messages_monthly" ? { ...row, balance: 10 } : row,
			),
		};

		const { mutation } = computeAtomFinalizeDecision({
			fullSubject: createSubjectFor({ state: moved }),
			command: {
				schemaVersion: 1,
				type: "atomFinalize",
				commandId: "cmd_atom_finalize",
				requestId: "req_atom_finalize",
				identity,
				occurredAt,
				org,
				lockId: "L1",
				featureId: locked.lock.feature_id,
				internalFeatureId: "feat_messages",
				finalValue: 50,
				properties: null,
				source: { atomId: "atom_1", writerId: "w_1", seq: 2 },
			},
			lock: locked.lock,
		});

		expect(mutation.result).toMatchObject({
			type: "finalize",
			status: "applied",
		});
		const settled = applyMutation({ state: moved, mutation });
		expect(settled.openLocks).toEqual([]);
		expect(balanceOf(settled)).toBe(-10);
	});

	test("B2: an undecided finalize settles the row as it names itself, and a confirm above a reject lock is rejected under the row's own overage: the lock stays open, the seq lands", () => {
		const locked = takeLock({ state: createState({ balance: 100 }) });

		const released = computeAtomFinalizeDecision({
			fullSubject: createSubjectFor({ state: locked.state }),
			command: undecidedFinalize({ finalValue: 0 }),
			lock: readBack(locked.lock),
		});
		const rejected = computeAtomFinalizeDecision({
			fullSubject: createSubjectFor({ state: locked.state }),
			command: undecidedFinalize({ finalValue: 101 }),
			lock: readBack(locked.lock),
		});

		const settled = applyMutation({
			state: locked.state,
			mutation: released.mutation,
		});
		expect(settled.openLocks).toEqual([]);
		expect(balanceOf(settled)).toBe(100);
		expect(rejected.mutation.result).toMatchObject({
			type: "finalize",
			status: "rejected",
		});
		const stillOpen = applyMutation({
			state: locked.state,
			mutation: rejected.mutation,
		});
		expect(stillOpen.openLocks).toHaveLength(1);
		expect(stillOpen.customer.atom_seqs).toEqual({ atom_1: { w_1: 2 } });
	});

	test("B3: an undecided finalize of a lock Autumn holds no row for names no feature to land under: refused as a lock not found", () => {
		expect(() =>
			computeAtomFinalizeDecision({
				fullSubject: createSubjectFor({ state: createState({ balance: 100 }) }),
				command: undecidedFinalize({ finalValue: 0 }),
				lock: null,
			}),
		).toThrow(LockNotFoundError);
	});

	test("B4: an undecided finalize of a row already settled lands only its seq, under the row's feature", () => {
		const locked = takeLock({ state: createState({ balance: 100 }) });
		const settled = applyMutation({
			state: locked.state,
			mutation: computeAtomFinalizeDecision({
				fullSubject: createSubjectFor({ state: locked.state }),
				command: undecidedFinalize({ finalValue: 0 }),
				lock: readBack(locked.lock),
			}).mutation,
		});

		const { mutation } = computeAtomFinalizeDecision({
			fullSubject: createSubjectFor({ state: settled }),
			command: undecidedFinalize({ finalValue: 0, seq: 3 }),
			lock: readBack(locked.lock),
		});

		expect(mutation.result.type).toBe("track");
		const landed = applyMutation({ state: settled, mutation });
		expect(balanceOf(landed)).toBe(100);
		expect(landed.customer.atom_seqs).toEqual({ atom_1: { w_1: 3 } });
	});
});
