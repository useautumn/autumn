import { SchedulerClient } from "@aws-sdk/client-scheduler";

const DEFAULT_AWS_REGION = "us-west-2";

const getSchedulerClientConfig = () => ({
	region: DEFAULT_AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
	},
});

export const schedulerClient = new SchedulerClient(getSchedulerClientConfig());
