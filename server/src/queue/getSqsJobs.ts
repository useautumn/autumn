import { getSqsEnv } from "@autumn/env/sqs";
import { createSqsJobs, type SqsJobs } from "@autumn/sqs";
import { logger } from "@/external/logtail/logtailUtils.js";

let sqsJobs: SqsJobs | undefined;

export const getSqsJobs = (): SqsJobs => {
	sqsJobs ??= createSqsJobs({ ctx: { logger }, config: { env: getSqsEnv() } });
	return sqsJobs;
};
