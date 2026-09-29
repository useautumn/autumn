import { createDynamoClient, type DynamoClient } from "@autumn/dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";

const getDynamoClientConfig = () => ({
	region: process.env.AWS_REGION || DEFAULT_AWS_REGION,
	// Set when pointed at a local emulator; unset in prod, where the SDK resolves the real endpoint.
	endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
	},
});

const clientsByCacheKey = new Map<string, DynamoClient>();

export const getDynamoClient = (): DynamoClient => {
	const config = getDynamoClientConfig();
	const cacheKey = `${config.region}:${config.endpoint ?? "aws"}`;
	const existing = clientsByCacheKey.get(cacheKey);
	if (existing) return existing;
	const client = createDynamoClient({ config });
	clientsByCacheKey.set(cacheKey, client);
	return client;
};

export const getDynamoDocumentClient = (): DynamoDBDocumentClient =>
	getDynamoClient().client as DynamoDBDocumentClient;
