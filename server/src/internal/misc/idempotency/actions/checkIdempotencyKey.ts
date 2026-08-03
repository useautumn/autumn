import { ErrCode, RecaseError } from "@autumn/shared";
import { claimDynamoIdempotencyKey } from "@/external/aws/dynamodb/idempotencyKeys/operations/claimDynamoIdempotencyKey.js";
import type { Logger } from "@/external/logtail/logtailUtils";
import { claimRedisIdempotencyKey } from "@/external/redis/idempotencyKeys/operations/claimRedisIdempotencyKey.js";
import { isIdempotencyDynamoReadEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { buildIdempotencyStorageKey } from "../idempotencyKeyUtils.js";

/**
 * Keys are always dual-written to Redis and DynamoDB. The
 * `idempotencyDynamoRead` miscellaneous-edge-config switch picks which store
 * is the conflict authority (awaited; a duplicate 409s; unavailable fails
 * open). The other store is a fire-and-forget mirror whose result never
 * affects the outcome — so the authority can be flipped either way losslessly
 * once both stores have seen a full TTL (24h) of writes.
 */
const throwDuplicateIdempotencyKey = (idempotencyKey: string): never => {
	throw new RecaseError({
		message: `Another request with idempotency key ${idempotencyKey} has already been received`,
		code: ErrCode.DuplicateIdempotencyKey,
		statusCode: 409,
	});
};

export const checkIdempotencyKey = async ({
	orgId,
	env,
	idempotencyKey,
	logger,
}: {
	orgId: string;
	env: string;
	idempotencyKey: string;
	logger: Logger;
}): Promise<void> => {
	const { hashedKey, storageKey } = buildIdempotencyStorageKey({
		orgId,
		env,
		idempotencyKey,
	});

	logger.info(
		`[checkIdempotencyKey] claiming idempotency key ${idempotencyKey}, hash: ${hashedKey}`,
	);

	if (isIdempotencyDynamoReadEnabled()) {
		const dynamoResult = await claimDynamoIdempotencyKey({
			storageKey,
			logger,
		});

		void claimRedisIdempotencyKey({ storageKey });
		if (dynamoResult === "duplicate") {
			throwDuplicateIdempotencyKey(idempotencyKey);
		}
		return;
	}

	const redisResult = await claimRedisIdempotencyKey({ storageKey });

	void claimDynamoIdempotencyKey({ storageKey, logger });
	if (redisResult === "duplicate") {
		throwDuplicateIdempotencyKey(idempotencyKey);
	}
};
