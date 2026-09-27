import { SchedulerClient } from "@aws-sdk/client-scheduler";
import {
	DEFAULT_AWS_REGION,
	extractRegionFromQueueUrl,
} from "@/external/aws/awsRegionUtils.js";
import { extractLocalEndpoint } from "@/queue/initSqs.js";

/** A schedule can only target SQS inside the same account, so locally the
 *  Scheduler must talk to the same emulator that serves the queue. */
const getSchedulerClientConfig = () => {
	const queueUrl = process.env.SQS_QUEUE_URL_V2;
	const endpoint = extractLocalEndpoint({ queueUrl });

	return {
		region: extractRegionFromQueueUrl({ queueUrl }) || DEFAULT_AWS_REGION,
		...(endpoint ? { endpoint } : {}),
		credentials: {
			accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
		},
	};
};

export const schedulerClient = new SchedulerClient(getSchedulerClientConfig());
