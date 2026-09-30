import pLimit from "p-limit";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { enqueueJob } from "../../jobs/actions/enqueueJob.ts";
import type { JobRow } from "../../jobs/types/jobRow.ts";

const ENQUEUE_CONCURRENCY = 16;

/** One `nuke:<acct>` job per account; live ones are attached to (deduped). */
export const enqueueNukeJobs = async ({
	ctx,
	accountIds,
}: {
	ctx: TwdContext;
	accountIds: string[];
}): Promise<{ job: JobRow; deduped: boolean }[]> => {
	const limit = pLimit(ENQUEUE_CONCURRENCY);
	return Promise.all(
		accountIds.map((accountId) =>
			limit(() =>
				enqueueJob({
					ctx,
					kind: "nuke",
					singletonKey: `nuke:${accountId}`,
					payload: { accountId },
				}),
			),
		),
	);
};
