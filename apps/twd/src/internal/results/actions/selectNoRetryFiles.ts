import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { failsEveryDevRun } from "./classifyFailure.ts";
import { loadDevBaselines } from "./triageRunFailures.ts";

/** Runs feeding the dev baseline keep retrying so its pass rates stay comparable; repeat runs count retries. */
export const skipsKnownRedRetries = ({
	isBaseline,
	repeat,
	retryFailsOnDev,
}: {
	isBaseline: boolean;
	repeat: number;
	retryFailsOnDev: boolean;
}) => !retryFailsOnDev && !isBaseline && repeat === 1;

/** Test ids of planned files whose failure is final on the first attempt. */
export const selectNoRetryFiles = async ({
	ctx,
	run,
	files,
}: {
	ctx: TwdContext;
	run: { isBaseline: boolean; repeat: number };
	files: string[];
}): Promise<string[]> => {
	if (
		!skipsKnownRedRetries({
			...run,
			retryFailsOnDev: ctx.env.TWD_RETRY_FAILS_ON_DEV,
		})
	)
		return [];
	const baselines = await loadDevBaselines({ ctx, files });
	return files.filter((file) => {
		const baseline = baselines.get(file);
		return baseline !== undefined && failsEveryDevRun(baseline);
	});
};
