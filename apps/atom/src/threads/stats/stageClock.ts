import { readFileSync } from "node:fs";

/** Where a thread's busy time goes; each is the stage's own time, without the stages it runs inside it. */
export const STAGES = [
	/** Hono's dispatch, middleware and handlers, each up to its first await; the stages they run are their own. */
	"honoRoute",
	/** The request body parsed and the response's JSON written. */
	"httpParseRespond",
	/** A check this replica does not own: signed and handed to the owner. */
	"hopForward",
	/** A check handed here by a peer: its signature verified. */
	"hopServe",
	/** The engine's decision on a check: computeCheck. */
	"engineDecision",
	/** A fold's replay of owed deductions onto a view, an append's continuation included: computeTrack, applyMutation. */
	"engineFoldStep",
	/** The replay of a push's acknowledged deductions onto the old copy, to tell whether the fold carries across it. */
	"engineFoldCheck",
	/** A customer's view joined, compared across a push, and rendered in the API's shape. */
	"viewRender",
	/** The journal's group commit, its fsync included. */
	"journalAppend",
	/** What the journal owes a customer, and whether it is backed up. */
	"journalOwed",
	/** A pushed, relayed or pulled subject parsed, stored and reconciled. */
	"pushApply",
	/** An operation signed and sent to the other replicas. */
	"relaySend",
	/** An operation from another replica verified. */
	"relayReceive",
	/** A settle pull sent; the subject it brings back is applied under pushApply. */
	"settlePull",
	/** A lock's row looked up for a retry or a finalize: the open-locks map, the owed scan and the replay that rebuilds it. */
	"lockLookup",
	/** The engine's decision on a finalize: computeFinalizeDecision. */
	"finalizeDecision",
	/** The forwarder's own work per batch: what is unsent, the hand-ins built and encoded for Autumn. */
	"forwardHandIn",
] as const;

export type Stage = (typeof STAGES)[number];

/** Microseconds each stage took on this thread since boot: module state is the thread's own. */
const spentUs = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<
	Stage,
	number
>;
/** Time the stage running now has spent in stages nested inside it, so each stage counts only its own. */
let nestedUs = 0;

/**
 * Runs `run` and counts its synchronous work to `stage`: an async function counts up to its first await, so time
 * spent waiting (on a peer, Autumn or the disk's turn) is never counted as busy.
 */
export const timeStage = <T>(stage: Stage, run: () => T): T => {
	const nestedBefore = nestedUs;
	nestedUs = 0;
	const startedAt = performance.now();
	try {
		return run();
	} finally {
		const elapsedUs = (performance.now() - startedAt) * 1000;
		spentUs[stage] += elapsedUs - nestedUs;
		nestedUs = nestedBefore + elapsedUs;
	}
};

/** CPU this thread has run, from the kernel's own count: what the stages are a share of. Null where it keeps none (gVisor). */
const threadCpuUs = (): number | null => {
	try {
		return (
			Number(
				readFileSync("/proc/thread-self/schedstat", "utf8").split(" ")[0],
			) / 1000
		);
	} catch {
		return null;
	}
};

const fieldOf = (stage: string) =>
	`stage${stage[0]?.toUpperCase()}${stage.slice(1)}Us`;

/**
 * Each stage's time since boot as its thread stat field (`stageEngineDecisionUs`), and the thread's busy time no stage
 * holds and its idle time beside them (where the kernel counts thread CPU), all in µs. `aliveUs` is how long the thread has run.
 */
export const readStageClock = ({
	aliveUs,
}: {
	aliveUs: number;
}): Record<string, number> => {
	const cpuUs = threadCpuUs();
	const stagedUs = STAGES.reduce((sum, stage) => sum + spentUs[stage], 0);
	const busyAndIdle =
		cpuUs === null
			? {}
			: {
					otherBusy: Math.max(0, cpuUs - stagedUs),
					idle: Math.max(0, aliveUs - cpuUs),
				};
	return Object.fromEntries(
		Object.entries({ ...spentUs, ...busyAndIdle }).map(([stage, us]) => [
			fieldOf(stage),
			Math.round(us),
		]),
	);
};
