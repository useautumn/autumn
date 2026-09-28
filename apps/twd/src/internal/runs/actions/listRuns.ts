import type { RunSummary } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { listRunsWithEmail, toRunSummary } from "../repos/runsRepo.ts";

export const listRuns = async ({
	ctx,
	status,
	branch,
	limit,
}: {
	ctx: TwdContext;
	status: "live" | "finished" | "all";
	branch?: string;
	limit: number;
}): Promise<RunSummary[]> =>
	(await listRunsWithEmail({ ctx, status, branch, limit })).map(toRunSummary);
