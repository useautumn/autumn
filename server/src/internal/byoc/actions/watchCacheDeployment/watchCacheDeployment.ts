import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeNextWatchStep } from "./steps/computeNextWatchStep.js";
import { pollCacheDeployment } from "./steps/pollCacheDeployment.js";
import { readWatchedCacheDeployment } from "./steps/readWatchedCacheDeployment.js";
import type { WatchCacheDeploymentOutcome } from "./types/watchCacheDeploymentTypes.js";

/** A watch that has not seen its Atom settle by then hands back to page reads. */
const WATCH_MAX_DURATION_MS = 2 * 60 * 60 * 1000;

/** Keeps one deployment group's record in step with alien until its Atom settles, the record moves on, or the watch runs out. */
export const watchCacheDeployment = async ({
	ctx,
	deploymentGroupId,
	waitFor,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
	waitFor: (params: { seconds: number }) => Promise<void>;
}): Promise<WatchCacheDeploymentOutcome> => {
	const deadline = Date.now() + WATCH_MAX_DURATION_MS;
	let failedPolls = 0;

	while (Date.now() < deadline) {
		// 1. Read: the stored record, not the run's copy, says what to watch.
		const cacheDeployment = await readWatchedCacheDeployment({
			ctx,
			deploymentGroupId,
		});
		if (!cacheDeployment) return "gone";

		// 2. Poll: alien's latest lands in the record.
		const poll = await pollCacheDeployment({ ctx, cacheDeployment });
		failedPolls = poll.ok ? 0 : failedPolls + 1;

		// 3. Compute the next step: stop, or wait as long as its status calls for.
		const step = computeNextWatchStep({ poll, failedPolls });
		if (step.settled) return step.outcome;
		await waitFor({ seconds: step.waitSeconds });
	}
	return "timed_out";
};
