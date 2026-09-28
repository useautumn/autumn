import type { JobKind } from "../../../db/schema/jobs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { JobRow } from "../types/jobRow.ts";

/**
 * Insert a job, or attach to the live job holding `singletonKey` (`deduped: true`).
 * Uses ctx.actor for created_by/via. OWNED BY THE JOBS TASK — signature is frozen.
 */
export const enqueueJob = async (_args: {
	ctx: TwdContext;
	kind: JobKind;
	singletonKey: string;
	payload: Record<string, unknown>;
}): Promise<{ job: JobRow; deduped: boolean }> => {
	throw new Error("enqueueJob: not implemented");
};
