import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";

/** Endpoint override when pointed at a local emulator (dynamodb-local /
 *  dynoxide). Unset in prod, where the SDK resolves the real AWS endpoint. */
export const getDynamoEndpoint = (): string | undefined =>
	process.env.DYNAMODB_ENDPOINT || undefined;

/** True when DYNAMODB_ENDPOINT points at a non-AWS host (local emulator). */
export const isLocalDynamoEndpoint = (): boolean => {
	const endpoint = getDynamoEndpoint();
	if (!endpoint) return false;
	try {
		return !new URL(endpoint).hostname.endsWith("amazonaws.com");
	} catch {
		return false;
	}
};

const getDynamoClientConfig = () => {
	const endpoint = getDynamoEndpoint();
	return {
		region: process.env.AWS_REGION || DEFAULT_AWS_REGION,
		...(endpoint ? { endpoint } : {}),
		credentials: {
			accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
		},
	};
};

const getDynamoCacheKey = () => {
	const config = getDynamoClientConfig();
	return `${config.region}:${config.endpoint ?? "aws"}`;
};

const documentClientsByCacheKey = new Map<string, DynamoDBDocumentClient>();

export const getDynamoDocumentClient = (): DynamoDBDocumentClient => {
	const cacheKey = getDynamoCacheKey();
	const existingClient = documentClientsByCacheKey.get(cacheKey);
	if (existingClient) return existingClient;

	const documentClient = DynamoDBDocumentClient.from(
		new DynamoDBClient(getDynamoClientConfig()),
		{ marshallOptions: { removeUndefinedValues: true } },
	);
	documentClientsByCacheKey.set(cacheKey, documentClient);
	return documentClient;
};
