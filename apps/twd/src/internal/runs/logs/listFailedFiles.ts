import type { RunFile } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getRun } from "../actions/getRun.ts";

/** Files whose final state is failed or crashed, as the run page shows them. */
export const listFailedFiles = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<RunFile[]> =>
	(await getRun({ ctx, runId })).files.filter(
		(f) => f.status === "failed" || f.status === "crashed",
	);
