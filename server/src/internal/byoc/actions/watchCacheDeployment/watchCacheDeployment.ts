import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeWatchStep } from "./compute/computeWatchStep.js";
import { pollCacheDeployment } from "./execute/pollCacheDeployment.js";
import { setupWatchedCacheDeployment } from "./setup/setupWatchedCacheDeployment.js";
import type { WatchCacheDeploymentOutcome } from "./types/watchCacheDeploymentTypes.js";
import { WATCH_MAX_DURATION_MS } from "./utils/watchCacheDeploymentConstants.js";

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
		// 1. Setup: the stored record, not the run's copy, says what to watch.
		const cacheDeployment = await setupWatchedCacheDeployment({
			ctx,
			deploymentGroupId,
		});
		if (!cacheDeployment) return "gone";

		// 2. Execute: alien's latest lands in the record.
		const poll = await pollCacheDeployment({ ctx, cacheDeployment });
		failedPolls = poll.ok ? 0 : failedPolls + 1;

		// 3. Compute: stop, or wait as long as its status calls for.
		const step = computeWatchStep({ poll, failedPolls });
		if (step.settled) return step.outcome;
		await waitFor({ seconds: step.waitSeconds });
	}
	return "timed_out";
};
