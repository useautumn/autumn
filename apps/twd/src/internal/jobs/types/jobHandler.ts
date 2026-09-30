import type { JobKind } from "../../../db/schema/jobs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { JobRow } from "./jobRow.ts";

export type JobHandlerArgs = {
	ctx: TwdContext;
	job: JobRow;
	/** Persist resumable progress; throws if this holder lost the lease (fencing). */
	checkpoint: (state: Record<string, unknown>) => Promise<void>;
	/** Aborted on cancel request or lease loss. */
	signal: AbortSignal;
};

/** Must be idempotent: a crashed job is re-run from its last checkpoint. */
export type JobHandler = (args: JobHandlerArgs) => Promise<void>;

export type JobHandlers = Record<JobKind, JobHandler>;
