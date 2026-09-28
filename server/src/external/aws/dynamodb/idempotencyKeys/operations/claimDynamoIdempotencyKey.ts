import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ensureLocalDynamoTable } from "@/external/aws/dynamodb/ensureLocalDynamoTable.js";
import {
	getIdempotencyTableName,
	IDEMPOTENCY_TABLE_PARTITION_KEY,
	IDEMPOTENCY_TABLE_TTL_ATTRIBUTE,
} from "@/external/aws/dynamodb/idempotencyKeys/idempotencyKeyTable.js";
import { getDynamoDocumentClient } from "@/external/aws/dynamodb/initDynamoDb.js";
import { withDynamoSpan } from "@/external/aws/dynamodb/withDynamoSpan.js";
import type { Logger } from "@/external/logtail/logtailUtils";
import {
	IDEMPOTENCY_TTL_MS,
	type IdempotencyClaimResult,
} from "@/internal/misc/idempotency/idempotencyKeyUtils.js";

export const claimDynamoIdempotencyKey = async ({
	storageKey,
	ttlMs = IDEMPOTENCY_TTL_MS,
	logger,
}: {
	storageKey: string;
	ttlMs?: number;
	logger?: Logger;
}): Promise<IdempotencyClaimResult> =>
	withDynamoSpan({
		name: "claim_idempotency_key",
		attributes: { "dynamodb.table": getIdempotencyTableName() },
		fn: async (setAttribute) => {
			const nowSeconds = Math.floor(Date.now() / 1000);
			const expiresAtSeconds = nowSeconds + Math.floor(ttlMs / 1000);

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
				setAttribute("dynamodb.outcome", "claimed");
				return "claimed";
			} catch (error) {
				if (error instanceof ConditionalCheckFailedException) {
					setAttribute("dynamodb.outcome", "duplicate");
					return "duplicate";
				}

				setAttribute("dynamodb.outcome", "unavailable");
				logger?.warn(
					`[claimDynamoIdempotencyKey] dynamo unavailable, failing open: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				return "unavailable";
			}
		},
	});
