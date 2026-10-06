import type { SQSClient } from "@aws-sdk/client-sqs";

/** The SDK client as the reader uses it: one command at a time, so a test can stand in for it. */
export type SqsClient = Pick<SQSClient, "send">;
