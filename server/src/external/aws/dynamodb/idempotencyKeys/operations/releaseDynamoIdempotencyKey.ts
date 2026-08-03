import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { getIdempotencyTableName } from "@/external/aws/dynamodb/idempotencyKeys/idempotencyKeyTable.js";
import { getDynamoDocumentClient } from "@/external/aws/dynamodb/initDynamoDb.js";

export const releaseDynamoIdempotencyKey = async ({
	storageKey,
}: {
	storageKey: string;
}): Promise<void> => {
	try {
		await getDynamoDocumentClient().send(
			new DeleteCommand({
				TableName: getIdempotencyTableName(),
				Key: { pk: storageKey },
			}),
		);
	} catch {
		return;
	}
};
