import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export type DynamoExecutor = Pick<DynamoDBDocumentClient, "send">;

export type DynamoClient = {
	client: DynamoExecutor;
	isLocalEndpoint: boolean;
	close(): void;
};

export type DynamoClientConfig = {
	region: string;
	endpoint?: string;
	credentials?: { accessKeyId: string; secretAccessKey: string };
};
