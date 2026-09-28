import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { getIdempotencyTableName } from "@/external/aws/dynamodb/idempotencyKeys/idempotencyKeyTable.js";
import { getDynamoDocumentClient } from "@/external/aws/dynamodb/initDynamoDb.js";
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
			try {
				await getDynamoDocumentClient().send(
					new DeleteCommand({
						TableName: getIdempotencyTableName(),
						Key: { pk: storageKey },
					}),
				);
				setAttribute("dynamodb.outcome", "released");
			} catch {
				setAttribute("dynamodb.outcome", "unavailable");
				return;
			}
		},
	});
