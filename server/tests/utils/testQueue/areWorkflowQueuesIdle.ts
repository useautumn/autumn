import { GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { getSqsClient } from "@/queue/initSqs";

const workflowQueueUrls = () =>
	[
		process.env.SQS_QUEUE_URL_V2,
		process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL,
	].filter((queueUrl): queueUrl is string => Boolean(queueUrl));

const countQueuedMessages = async ({ queueUrl }: { queueUrl: string }) => {
	const { Attributes } = await getSqsClient({ queueUrl }).send(
		new GetQueueAttributesCommand({
			QueueUrl: queueUrl,
			AttributeNames: [
				"ApproximateNumberOfMessages",
				"ApproximateNumberOfMessagesNotVisible",
			],
		}),
	);
	return (
		Number(Attributes?.ApproximateNumberOfMessages ?? 0) +
		Number(Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0)
	);
};

/** True when no job that webhook handlers enqueue (line items, resets, webhook replays) is waiting or running. */
export const areWorkflowQueuesIdle = async () => {
	const counts = await Promise.all(
		workflowQueueUrls().map((queueUrl) => countQueuedMessages({ queueUrl })),
	);
	return counts.every((count) => count === 0);
};
