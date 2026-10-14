import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeAtomFinalizeDecision,
	computeTrack,
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
});
