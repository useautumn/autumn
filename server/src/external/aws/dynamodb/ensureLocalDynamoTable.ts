import {
	CreateTableCommand,
	ResourceInUseException,
	UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import {
	getDynamoDocumentClient,
	isLocalDynamoEndpoint,
} from "./initDynamoDb.js";

const createTable = async ({
	tableName,
	partitionKey,
	ttlAttribute,
}: {
	tableName: string;
	partitionKey: string;
	ttlAttribute?: string;
}): Promise<void> => {
	const documentClient = getDynamoDocumentClient();

	try {
		await documentClient.send(
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
		await documentClient.send(
			new UpdateTimeToLiveCommand({
				TableName: tableName,
				TimeToLiveSpecification: {
					AttributeName: ttlAttribute,
					Enabled: true,
				},
			}),
		);
	} catch {
		// Already enabled (ValidationException) — emulators accept but never
		// sweep TTL anyway, so callers must enforce expiry in their conditions.
	}
};

const ensuredTables = new Map<string, Promise<void>>();

/** Local emulators start empty, so tables are auto-created on first use (once
 *  per process per table). Never runs against real AWS, where tables are
 *  one-time infra (no DYNAMODB_ENDPOINT override → no-op). */
export const ensureLocalDynamoTable = ({
	tableName,
	partitionKey,
	ttlAttribute,
}: {
	tableName: string;
	partitionKey: string;
	ttlAttribute?: string;
}): Promise<void> => {
	if (!isLocalDynamoEndpoint()) return Promise.resolve();

	const existing = ensuredTables.get(tableName);
	if (existing) return existing;

	const ensurePromise = createTable({
		tableName,
		partitionKey,
		ttlAttribute,
	}).catch((error) => {
		ensuredTables.delete(tableName);
		throw error;
	});
	ensuredTables.set(tableName, ensurePromise);
	return ensurePromise;
};
