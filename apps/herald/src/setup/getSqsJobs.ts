import { getSqsEnv } from "@autumn/env/sqs";
import { createSqsJobs, type SqsJobs } from "@autumn/sqs";
import { getHeraldLogger } from "./getHeraldLogger.js";

let sqsJobs: SqsJobs | undefined;

export function getSqsJobs(): SqsJobs {
	sqsJobs ??= createSqsJobs({
		ctx: { logger: getHeraldLogger() },
		config: { env: getSqsEnv() },
	});
	return sqsJobs;
}
