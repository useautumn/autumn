import type { Message } from "@aws-sdk/client-sqs";
import { logger as baseLogger } from "@/external/logtail/logtailUtils.js";
import { addWorkflowToLogs } from "@/utils/logging/addContextToLogs.js";
import type { SqsJob } from "../processMessage.js";
import { shouldReportJobFailure } from "./shouldReportJobFailure.js";
import type { RetryBudget } from "./types/retryBudget.js";

export class JobTimeoutError extends Error {
	/** Every timeout shares this file's stack, so the job name is what tells issues apart. */
	readonly fingerprint: string[];

	constructor({ jobName, timeoutMs }: { jobName: string; timeoutMs: number }) {
		super(`${jobName} timed out after ${timeoutMs}ms`);
		this.name = "JobTimeoutError";
		this.fingerprint = ["job-timeout", jobName];
	}
}

/** A stalled job is left un-ACKed for SQS to redeliver, so like any failure it is reported once SQS gives up. */
export const reportJobTimeout = ({
	job,
	message,
	timeoutMs,
	retryBudget,
	logger = baseLogger,
}: {
	job: SqsJob;
	message: Message;
	timeoutMs: number;
	retryBudget: RetryBudget;
	logger?: typeof baseLogger;
}) => {
	const receiveCount = Number(message.Attributes?.ApproximateReceiveCount);
	const jobLogger = addWorkflowToLogs({
		logger,
		workflowContext: {
			id: message.MessageId ?? "unknown",
			name: job.name,
			payload: job.data,
		},
	});
	const fields = {
		error: new JobTimeoutError({ jobName: job.name, timeoutMs }),
		context: {
			org_id: job.data?.orgId,
			env: job.data?.env,
			customer_id: job.data?.customerId,
		},
	};

	if (shouldReportJobFailure({ willRetry: true, receiveCount, retryBudget })) {
		jobLogger.error(`${job.name} timed out and SQS will not retry it`, fields);
		return;
	}
	jobLogger.warn(
		`${job.name} timed out on delivery ${receiveCount}, SQS will retry`,
		fields,
	);
};
