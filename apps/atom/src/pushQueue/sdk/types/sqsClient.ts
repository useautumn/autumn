import type { SQSClient } from "@aws-sdk/client-sqs";

export type SqsClient = Pick<SQSClient, "send">;
