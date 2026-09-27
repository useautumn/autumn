import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { DynamoClient, DynamoClientConfig } from "./types/dynamoClient.js";

const isEmulator = ({ endpoint }: { endpoint?: string }): boolean => {
	if (!endpoint) return false;
	try {
		return !new URL(endpoint).hostname.endsWith("amazonaws.com");
	} catch {
		return false;
	}
};

export const createDynamoClient = ({
	config,
}: {
	config: DynamoClientConfig;
}): DynamoClient => {
	const raw = new DynamoDBClient({
		region: config.region,
		...(config.endpoint && { endpoint: config.endpoint }),
		...(config.credentials && { credentials: config.credentials }),
	});
	const client = DynamoDBDocumentClient.from(raw, {
		marshallOptions: { removeUndefinedValues: true },
	});
	return {
		client,
		isLocalEndpoint: isEmulator({ endpoint: config.endpoint }),
		close: () => raw.destroy(),
	};
};
