import type { JobKind } from "../../../db/schema/jobs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { JobRow } from "./jobRow.ts";

export type JobHandlerArgs = {
	ctx: TwdContext;
	job: JobRow;
	checkpoint: (state: Record<string, unknown>) => Promise<void>;
	signal: AbortSignal;
};

export type JobHandler = (args: JobHandlerArgs) => Promise<void>;

export type JobHandlers = Record<JobKind, JobHandler>;
