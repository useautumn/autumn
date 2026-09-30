import type { LiveServerMessage } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getCapacity } from "../../capacity/actions/getCapacity.ts";
import { selectApiJobs } from "../../jobs/repos/selectApiJobs.ts";
import { getRun } from "../../runs/actions/getRun.ts";
import { listRuns } from "../../runs/actions/listRuns.ts";

type SnapshotData = Extract<LiveServerMessage, { type: "snapshot" }>["data"];

const RUNS_SNAPSHOT_LIMIT = 100;
const JOBS_SNAPSHOT_LIMIT = 100;

/** keys/accounts/warm snapshots are null: those topics only signal "refetch the REST route". */
export const loadTopicSnapshot = async ({
	ctx,
	topic,
}: {
	ctx: TwdContext;
	topic: string;
}): Promise<SnapshotData> => {
	if (topic.startsWith("run:"))
		return getRun({ ctx, runId: topic.slice("run:".length) });
	if (topic === "runs")
		return listRuns({ ctx, status: "all", limit: RUNS_SNAPSHOT_LIMIT });
	if (topic === "jobs")
		return selectApiJobs({ db: ctx.db, limit: JOBS_SNAPSHOT_LIMIT });
	if (topic === "capacity") return getCapacity({ ctx });
	return null;
};
