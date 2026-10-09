import type { AtomContext } from "../types/atomContext.js";
import type { AtomRecord } from "../types/atomRecord.js";
import { computeNextWatchStep } from "./steps/computeNextWatchStep.js";
import { pollAtomRecord } from "./steps/pollAtomRecord.js";
import type { WatchAtomRecordOutcome } from "./types/watchAtomRecordTypes.js";

/** A watch that has not seen its Atom settle by then hands back to page reads. */
const WATCH_MAX_DURATION_MS = 2 * 60 * 60 * 1000;

/** Keeps one Atom's record in step with its deployer until the Atom settles, the record moves on, or the watch runs out. */
export const watchAtomRecord = async <T extends AtomRecord>({
	ctx,
	waitFor,
}: {
	ctx: AtomContext<T>;
	waitFor: (params: { seconds: number }) => Promise<void>;
}): Promise<WatchAtomRecordOutcome> => {
	const deadline = Date.now() + WATCH_MAX_DURATION_MS;
	let failedPolls = 0;

	while (Date.now() < deadline) {
		// 1. Read: the stored record, not the run's copy, says what to watch.
		const record = await ctx.storage.find();
		if (!record) return "gone";

		// 2. Poll: the deployer's latest lands in the record.
		const poll = await pollAtomRecord({ ctx, record });
		failedPolls = poll.ok ? 0 : failedPolls + 1;

		// 3. Compute the next step: stop, or wait as long as its status calls for.
		const step = computeNextWatchStep({ poll, failedPolls });
		if (step.settled) return step.outcome;
		await waitFor({ seconds: step.waitSeconds });
	}
	return "timed_out";
};
