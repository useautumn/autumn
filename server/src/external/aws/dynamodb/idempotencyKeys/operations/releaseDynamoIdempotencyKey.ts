import { releaseIdempotencyKey } from "@autumn/dynamodb";
import { getIdempotencyTableName } from "@/external/aws/dynamodb/idempotencyKeys/idempotencyKeyTable.js";
import { getDynamoClient } from "@/external/aws/dynamodb/initDynamoDb.js";
import { withDynamoSpan } from "@/external/aws/dynamodb/withDynamoSpan.js";

export const releaseDynamoIdempotencyKey = async ({
	storageKey,
}: {
	storageKey: string;
}): Promise<void> =>
	withDynamoSpan({
		name: "release_idempotency_key",
		attributes: { "dynamodb.table": getIdempotencyTableName() },
		fn: async (setAttribute) => {
			await releaseIdempotencyKey({
				ctx: {
					dynamo: getDynamoClient(),
					tableName: getIdempotencyTableName(),
				},
				storageKey,
			});
			setAttribute("dynamodb.outcome", "released");
		},
	});
