import type { SQSClient } from "@aws-sdk/client-sqs";

/** What a queue runs against: the SDK client, or a test double. */
export type SqsExecutor = Pick<SQSClient, "send">;

export type SqsClient = {
	client: SqsExecutor;
	/** True when `endpoint` is an emulator; batch replies are unreliable there, so messages go one at a time. */
	isLocalEndpoint: boolean;
	close(): void;
};

export type SqsClientConfig = {
	region: string;
	/** A local emulator (fakecloud); unset means the AWS endpoint for the region. */
	endpoint?: string;
	/** Static credentials for an emulator; unset lets the SDK resolve the task role. */
	credentials?: { accessKeyId: string; secretAccessKey: string };
};
