import {
	claimIdempotencyKey,
	type IdempotencyClaimResult,
} from "@autumn/dynamodb";
import { getIdempotencyTableName } from "@/external/aws/dynamodb/idempotencyKeys/idempotencyKeyTable.js";
import { getDynamoClient } from "@/external/aws/dynamodb/initDynamoDb.js";
import { withDynamoSpan } from "@/external/aws/dynamodb/withDynamoSpan.js";
import type { Logger } from "@/external/logtail/logtailUtils";
import { IDEMPOTENCY_TTL_MS } from "@/internal/misc/idempotency/idempotencyKeyUtils.js";

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
			const outcome = await claimIdempotencyKey({
				ctx: {
					dynamo: getDynamoClient(),
					tableName: getIdempotencyTableName(),
					logger,
				},
				claim: { storageKey, ttlMs },
			});
			setAttribute("dynamodb.outcome", outcome);
			return outcome;
		},
	});
