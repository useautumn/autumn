import { createHash } from "node:crypto";
import {
	applyMutation,
	computeAtomFinalizeDecision,
	computeConfirmExpiredLock,
	computeFinalize,
	computeTrack,
	type SubjectState,
	type SubjectStateMutation,
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

/** Well past where a lookup index would take over from a scan, so every path runs in both regimes. */
const LOCKS = 300;
const DAY_MS = 86_400_000;

type Recorded =
	| { step: string; mutation: SubjectStateMutation }
	| { step: string; error: string };

type Run = {
	state: SubjectState;
	locks: Map<string, WorkerLock>;
	recorded: Recorded[];
	everyMutation: string[];
};

const lockRowOf = ({
	mutation,
}: {
	mutation: SubjectStateMutation;
}): WorkerLock => {
	const change = mutation.changes.find(
		(rowChange) => rowChange.table === "locks" && rowChange.op === "insert",
	);
	if (change?.table !== "locks" || change.op !== "insert")
		throw new Error("Expected the track to open a lock");
	return change.row;
};

const attempt = ({
	run,
	step,
	compute,
	record = true,
}: {
	run: Run;
	step: string;
	compute: () => SubjectStateMutation;
	record?: boolean;
}): SubjectStateMutation | null => {
	try {
		const mutation = compute();
		run.everyMutation.push(JSON.stringify(mutation));
		if (record) run.recorded.push({ step, mutation });
		return mutation;
	} catch (error) {
		run.recorded.push({ step, error: String(error) });
		return null;
	}
};

const apply = ({
	run,
	step,
	mutation,
}: {
	run: Run;
	step: string;
	mutation: SubjectStateMutation;
}): void => {
	try {
		run.state = applyMutation({ state: run.state, mutation });
	} catch (error) {
		run.recorded.push({ step: `${step}:apply`, error: String(error) });
	}
};

const lock = ({ run, n, record }: { run: Run; n: number; record: boolean }) => {
	const step = `lock:${n}`;
	const mutation = attempt({
		run,
		step,
		record,
		compute: () =>
			computeTrack({
				fullSubject: createSubjectFor({ state: run.state }),
				command: {
					...createTrackCommand({ value: 1, commandId: `cmd_lock_${n}` }),
					lock: {
						id: `lck_${n}`,
						lockId: `L${n}`,
						expiresAt: occurredAt + DAY_MS,
						expiryAction: n % 2 === 0 ? "confirm" : "release",
					},
				},
			}),
	});
	if (!mutation) return;
	run.locks.set(`L${n}`, lockRowOf({ mutation }));
	apply({ run, step, mutation });
};

const finalize = ({
	run,
	n,
	finalValue,
}: {
	run: Run;
	n: number;
	finalValue: number;
}) => {
	const step = `finalize:${n}:${finalValue}`;
	const held = run.locks.get(`L${n}`);
	if (!held) throw new Error(`Scenario never locked L${n}`);
	const mutation = attempt({
		run,
		step,
		compute: () =>
			computeFinalize({
				fullSubject: createSubjectFor({ state: run.state }),
				command: {
					schemaVersion: 1,
					type: "finalize",
					commandId: `cmd_finalize_${n}`,
					requestId: "req_finalize",
					identity,
					occurredAt,
					org,
					lock: held,
					internalFeatureId: "feat_messages",
					finalValue,
					properties: null,
				},
			}),
	});
	if (mutation) apply({ run, step, mutation });
};

const expire = ({ run, n }: { run: Run; n: number }) => {
	const step = `expire:${n}`;
	const mutation = attempt({
		run,
		step,
		compute: () =>
			computeConfirmExpiredLock({
				fullSubject: createSubjectFor({ state: run.state }),
				command: {
					schemaVersion: 1,
					type: "confirmExpiredLock",
					commandId: `cmd_expire_${n}`,
					requestId: "req_expire",
					identity,
					occurredAt: occurredAt + DAY_MS + 1,
					lock: { id: `lck_${n}`, lock_id: `L${n}` },
				},
			}),
	});
	if (mutation) apply({ run, step, mutation });
};

const confirm = ({
	run,
	n,
	finalValue,
	seq,
}: {
	run: Run;
	n: number;
	finalValue: number;
	seq: number;
}) => {
	const step = `confirm:${n}:${finalValue}`;
	const held = run.locks.get(`L${n}`) ?? null;
	const mutation = attempt({
		run,
		step,
		compute: () =>
			computeAtomFinalizeDecision({
				fullSubject: createSubjectFor({ state: run.state }),
				command: {
					schemaVersion: 1,
					type: "atomFinalize",
					commandId: `cmd_confirm_${n}`,
					requestId: "req_confirm",
					identity,
					occurredAt,
					org,
					lockId: `L${n}`,
					featureId: held?.feature_id ?? "messages",
					internalFeatureId: "feat_messages",
					finalValue,
					properties: null,
					source: { atomId: "atom_1", writerId: "w_1", seq },
				},
				lock: held,
			}).mutation,
	});
	if (mutation) apply({ run, step, mutation });
};

/**
 * Every engine path that reads or writes a subject's open locks, over a subject holding more locks than a scan is
 * reasonable for: locks taken past the threshold, a duplicate, finalizes, expiries and Atom confirms of locks at the
 * front, middle and back of the list, each of them again once the lock is gone, and a mutation applied twice.
 */
export const runOpenLocksScenario = () => {
	const run: Run = {
		state: createState({ balance: 100_000 }),
		locks: new Map(),
		recorded: [],
		everyMutation: [],
	};
	for (let n = 1; n <= LOCKS; n++) lock({ run, n, record: n > LOCKS - 3 });
	lock({ run, n: 7, record: true });
	finalize({ run, n: 1, finalValue: 3 });
	finalize({ run, n: 150, finalValue: 0 });
	finalize({ run, n: LOCKS, finalValue: 5 });
	finalize({ run, n: 150, finalValue: 2 });
	expire({ run, n: 2 });
	expire({ run, n: 151 });
	expire({ run, n: 2 });
	confirm({ run, n: 3, finalValue: 4, seq: 1 });
	confirm({ run, n: 152, finalValue: 1, seq: 2 });
	confirm({ run, n: 3, finalValue: 4, seq: 3 });
	const relock = attempt({
		run,
		step: "relock:4",
		compute: () =>
			computeTrack({
				fullSubject: createSubjectFor({
					state: { ...run.state, openLocks: run.state.openLocks.slice(4) },
				}),
				command: {
					...createTrackCommand({ value: 1, commandId: "cmd_relock_4" }),
					lock: {
						id: "lck_4",
						lockId: "L4",
						expiresAt: occurredAt + DAY_MS,
						expiryAction: "confirm",
					},
				},
			}),
	});
	if (relock) apply({ run, step: "relock:4", mutation: relock });
	const unlockGone = {
		...run.recorded.find(
			(entry): entry is Extract<Recorded, { mutation: SubjectStateMutation }> =>
				"mutation" in entry && entry.step === "expire:151",
		)?.mutation,
		revision: {
			before: run.state.revision,
			after: run.state.revision + 1,
		},
	} as SubjectStateMutation;
	apply({ run, step: "expire:151:again", mutation: unlockGone });
	return {
		recorded: run.recorded,
		openLocks: run.state.openLocks,
		everyMutationSha256: createHash("sha256")
			.update(run.everyMutation.join("\n"))
			.digest("hex"),
	};
};
