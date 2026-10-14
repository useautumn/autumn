import type { Message } from "@aws-sdk/client-sqs";
import { logger as baseLogger } from "@/external/logtail/logtailUtils.js";
import { addWorkflowToLogs } from "@/utils/logging/addContextToLogs.js";
import type { SqsJob } from "../processMessage.js";
import { shouldReportJobFailure } from "./shouldReportJobFailure.js";
import type { RetryBudget } from "./types/retryBudget.js";

export class JobTimeoutError extends Error {
	readonly fingerprint: string[];

	constructor({ jobName, timeoutMs }: { jobName: string; timeoutMs: number }) {
		super(`${jobName} timed out after ${timeoutMs}ms`);
		this.name = "JobTimeoutError";
		this.fingerprint = ["job-timeout", jobName];
	}
}

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
		jobLogger.error(
			`${job.name} timed out on delivery ${receiveCount}`,
			fields,
		);
		return;
	}
	jobLogger.warn(
		`${job.name} timed out on delivery ${receiveCount}, SQS will retry`,
		fields,
	);
};
