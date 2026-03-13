import { SchedulerClient } from "@aws-sdk/client-scheduler";
import {
	DEFAULT_AWS_REGION,
	extractRegionFromQueueUrl,
} from "@/external/aws/awsRegionUtils.js";

const getSchedulerClientConfig = () => ({
	region:
		extractRegionFromQueueUrl({
			queueUrl: process.env.SQS_QUEUE_URL,
		}) || DEFAULT_AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
	},
});

export const schedulerClient = new SchedulerClient(getSchedulerClientConfig());
