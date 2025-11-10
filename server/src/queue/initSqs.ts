import { SQSClient } from "@aws-sdk/client-sqs";

export const sqs = new SQSClient({
	region: process.env.AWS_REGION || "eu-west-2",
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
	},
});

// SQS Queue URL - you'll need to create this queue in AWS console or via terraform
export const QUEUE_URL = process.env.SQS_QUEUE_URL || "";
