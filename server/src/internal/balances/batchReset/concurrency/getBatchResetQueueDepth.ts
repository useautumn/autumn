import { GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { getSqsClient } from "@/queue/initSqs.js";

export type BatchResetQueueDepth = {
	visible: number;
	inFlight: number;
	total: number;
};

export const getBatchResetQueueDepth =
	async (): Promise<BatchResetQueueDepth | null> => {
		const queueUrl = process.env.BATCH_RESET_SQS_QUEUE_URL;
		if (!queueUrl) return null;

		const sqsClient = getSqsClient({ queueUrl });
		const response = await sqsClient.send(
			new GetQueueAttributesCommand({
				QueueUrl: queueUrl,
				AttributeNames: [
					"ApproximateNumberOfMessages",
					"ApproximateNumberOfMessagesNotVisible",
				],
			}),
		);

		const visible = Number(
			response.Attributes?.ApproximateNumberOfMessages ?? 0,
		);
		const inFlight = Number(
			response.Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0,
		);

		return { visible, inFlight, total: visible + inFlight };
	};
