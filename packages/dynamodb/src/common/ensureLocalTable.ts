import {
	CreateTableCommand,
	ResourceInUseException,
	UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import type { DynamoClient } from "../types/dynamoClient.js";

const ensuredTables = new Map<string, Promise<void>>();

const createTable = async ({
	ctx,
	tableName,
	partitionKey,
	ttlAttribute,
}: {
	ctx: { dynamo: DynamoClient };
	tableName: string;
	partitionKey: string;
	ttlAttribute?: string;
}): Promise<void> => {
	try {
		await ctx.dynamo.client.send(
			new CreateTableCommand({
				TableName: tableName,
				AttributeDefinitions: [
					{ AttributeName: partitionKey, AttributeType: "S" },
				],
				KeySchema: [{ AttributeName: partitionKey, KeyType: "HASH" }],
				BillingMode: "PAY_PER_REQUEST",
			}),
		);
	} catch (error) {
		if (!(error instanceof ResourceInUseException)) throw error;
	}
	if (!ttlAttribute) return;
	try {
		await ctx.dynamo.client.send(
			new UpdateTimeToLiveCommand({
				TableName: tableName,
				TimeToLiveSpecification: { AttributeName: ttlAttribute, Enabled: true },
			}),
		);
	} catch {
		// Already enabled. Emulators accept but never sweep TTL, so conditions enforce expiry themselves.
	}
};

/** Emulators start empty, so a table is created on first use, once per process. On AWS tables are infra: a no-op. */
export const ensureLocalTable = ({
	ctx,
	tableName,
	partitionKey,
	ttlAttribute,
}: {
	ctx: { dynamo: DynamoClient };
	tableName: string;
	partitionKey: string;
	ttlAttribute?: string;
}): Promise<void> => {
	if (!ctx.dynamo.isLocalEndpoint) return Promise.resolve();
	const existing = ensuredTables.get(tableName);
	if (existing) return existing;
	const ensuring = createTable({
		ctx,
		tableName,
		partitionKey,
		ttlAttribute,
	}).catch((error) => {
		ensuredTables.delete(tableName);
		throw error;
	});
	ensuredTables.set(tableName, ensuring);
	return ensuring;
};
