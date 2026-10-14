import { readFileSync } from "node:fs";

/** Where a thread's busy time goes; each is the stage's own time, without the stages it runs inside it. */
export const STAGES = [
	/** The request body parsed and the response's JSON written. */
	"httpParseRespond",
	/** A check this replica does not own: signed and handed to the owner. */
	"hopForward",
	/** A check handed here by a peer: its signature verified. */
	"hopServe",
	/** The engine's decision and the rows it moves: computeCheck, computeTrack, applyMutation. */
	"engineStep",
	/** A customer's view joined, compared across a push, and rendered in the API's shape. */
	"viewRender",
	/** The journal's group commit, its fsync included. */
	"journalAppend",
	/** A pushed, relayed or pulled subject parsed, stored and reconciled. */
	"pushApply",
	/** An operation signed and sent to the other replicas. */
	"relaySend",
	/** An operation from another replica verified. */
	"relayReceive",
	/** A settle pull sent; the subject it brings back is applied under pushApply. */
	"settlePull",
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

/** CPU this thread has run, from the kernel's own count: what the stages are a share of. */
const threadCpuUs = (): number =>
	Number(readFileSync("/proc/thread-self/schedstat", "utf8").split(" ")[0]) /
	1000;

const fieldOf = (stage: string) =>
	`stage${stage[0]?.toUpperCase()}${stage.slice(1)}Us`;

/**
 * Each stage's time since boot as its thread stat field (`stageEngineStepUs`), and the thread's busy time no stage
 * holds and its idle time beside them, all in µs. `aliveUs` is how long the thread has run.
 */
export const readStageClock = ({
	aliveUs,
}: {
	aliveUs: number;
}): Record<string, number> => {
	const cpuUs = threadCpuUs();
	const stagedUs = STAGES.reduce((sum, stage) => sum + spentUs[stage], 0);
	return Object.fromEntries(
		Object.entries({
			...spentUs,
			otherBusy: Math.max(0, cpuUs - stagedUs),
			idle: Math.max(0, aliveUs - cpuUs),
		}).map(([stage, us]) => [fieldOf(stage), Math.round(us)]),
	);
};
