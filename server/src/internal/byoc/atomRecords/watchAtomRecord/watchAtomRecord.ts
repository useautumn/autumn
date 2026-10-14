import type { AtomContext } from "../types/atomContext.js";
import type { AtomRecord } from "../types/atomRecord.js";
import { computeNextWatchStep } from "./steps/computeNextWatchStep.js";
import { pollAtomRecord } from "./steps/pollAtomRecord.js";
import type { WatchAtomRecordOutcome } from "./types/watchAtomRecordTypes.js";

const WATCH_MAX_DURATION_MS = 2 * 60 * 60 * 1000;

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
		const record = await ctx.storage.find();
		if (!record) return "gone";

		const poll = await pollAtomRecord({ ctx, record });
		failedPolls = poll.ok ? 0 : failedPolls + 1;

		const step = computeNextWatchStep({ poll, failedPolls });
		if (step.settled) return step.outcome;
		await waitFor({ seconds: step.waitSeconds });
	}
	return "timed_out";
};
