import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/** What a repo runs against: the document client, or a test double. */
export type DynamoExecutor = Pick<DynamoDBDocumentClient, "send">;

export type DynamoClient = {
	client: DynamoExecutor;
	/** True when `endpoint` is an emulator; tables are auto-created there and never on AWS. */
	isLocalEndpoint: boolean;
	close(): void;
};

export type DynamoClientConfig = {
	region: string;
	/** A local emulator (dynamodb-local, dynoxide); unset means the AWS endpoint for the region. */
	endpoint?: string;
	/** Static credentials for an emulator; unset lets the SDK resolve the task role. */
	credentials?: { accessKeyId: string; secretAccessKey: string };
};
