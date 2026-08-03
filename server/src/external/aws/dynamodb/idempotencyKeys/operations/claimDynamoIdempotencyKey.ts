import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ensureLocalDynamoTable } from "@/external/aws/dynamodb/ensureLocalDynamoTable.js";
import {
	getIdempotencyTableName,
	IDEMPOTENCY_TABLE_PARTITION_KEY,
	IDEMPOTENCY_TABLE_TTL_ATTRIBUTE,
} from "@/external/aws/dynamodb/idempotencyKeys/idempotencyKeyTable.js";
import { getDynamoDocumentClient } from "@/external/aws/dynamodb/initDynamoDb.js";
import type { Logger } from "@/external/logtail/logtailUtils";
import {
	IDEMPOTENCY_TTL_MS,
	type IdempotencyClaimResult,
} from "@/internal/misc/idempotency/idempotencyKeyUtils.js";

export const claimDynamoIdempotencyKey = async ({
	storageKey,
	logger,
}: {
	storageKey: string;
	logger?: Logger;
}): Promise<IdempotencyClaimResult> => {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const expiresAtSeconds = nowSeconds + Math.floor(IDEMPOTENCY_TTL_MS / 1000);

	try {
		await ensureLocalDynamoTable({
			tableName: getIdempotencyTableName(),
			partitionKey: IDEMPOTENCY_TABLE_PARTITION_KEY,
			ttlAttribute: IDEMPOTENCY_TABLE_TTL_ATTRIBUTE,
		});
		await getDynamoDocumentClient().send(
			new PutCommand({
				TableName: getIdempotencyTableName(),
				Item: {
					pk: storageKey,
					createdAt: nowSeconds,
					expiresAt: expiresAtSeconds,
				},
				// DynamoDB deletes TTL-expired items lazily (possibly days late),
				// so an expired-but-present item must remain claimable.
				ConditionExpression: "attribute_not_exists(pk) OR expiresAt < :now",
				ExpressionAttributeValues: { ":now": nowSeconds },
			}),
		);
		return "claimed";
	} catch (error) {
		if (error instanceof ConditionalCheckFailedException) return "duplicate";

		logger?.warn(
			`[claimDynamoIdempotencyKey] dynamo unavailable, failing open: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return "unavailable";
	}
};
