import { GetQueueAttributesCommand, type SQSClient } from "@aws-sdk/client-sqs";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { RetryBudget } from "./types/retryBudget.js";

/** Read from the live queue, not a constant: prod queues differ (10, 5, none) and infra can change. */
export const getQueueRetryBudget = async ({
	sqs,
	queueUrl,
}: {
	sqs: SQSClient;
	queueUrl: string;
}): Promise<RetryBudget> => {
	try {
		const { Attributes } = await sqs.send(
			new GetQueueAttributesCommand({
				QueueUrl: queueUrl,
				AttributeNames: ["RedrivePolicy"],
			}),
		);
		if (!Attributes?.RedrivePolicy) return { kind: "unbounded" };

		const maxReceiveCount = Number(
			JSON.parse(Attributes.RedrivePolicy).maxReceiveCount,
		);
		if (!Number.isInteger(maxReceiveCount) || maxReceiveCount < 1) {
			return { kind: "unknown" };
		}
		return { kind: "bounded", maxReceiveCount };
	} catch (error) {
		logger.warn(`Could not read retry budget for ${queueUrl}`, { error });
		return { kind: "unknown" };
	}
};
