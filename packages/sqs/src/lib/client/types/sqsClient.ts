import type { SQSClient } from "@aws-sdk/client-sqs";

export type SqsExecutor = Pick<SQSClient, "send">;

export type SqsClient = {
	client: SqsExecutor;
	isLocalEndpoint: boolean;
	close(): void;
};

export type SqsClientConfig = {
	region: string;
	endpoint?: string;
	credentials?: { accessKeyId: string; secretAccessKey: string };
};
