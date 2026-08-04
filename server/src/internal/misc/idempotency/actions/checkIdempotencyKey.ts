import { ErrCode, RecaseError } from "@autumn/shared";
import { claimDynamoIdempotencyKey } from "@/external/aws/dynamodb/idempotencyKeys/operations/claimDynamoIdempotencyKey.js";
import { claimRedisIdempotencyKey } from "@/external/redis/actions/idempotencyKeys/operations/claimRedisIdempotencyKey.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
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
	ctx,
	idempotencyKey,
	ttlMs,
}: {
	ctx: AutumnContext;
	idempotencyKey: string;
	/** Org-configurable per route group — defaults to 24h in the stores. */
	ttlMs?: number;
}): Promise<void> => {
	const { logger } = ctx;
	const { hashedKey, storageKey } = buildIdempotencyStorageKey({
		orgId: ctx.org.id,
		env: ctx.env,
		idempotencyKey,
	});

	logger.info(
		`[checkIdempotencyKey] claiming idempotency key ${idempotencyKey}, hash: ${hashedKey}`,
	);

	if (isIdempotencyDynamoReadEnabled()) {
		const dynamoResult = await claimDynamoIdempotencyKey({
			storageKey,
			ttlMs,
			logger,
		});

		void claimRedisIdempotencyKey({ storageKey, ttlMs });
		if (dynamoResult === "duplicate") {
			throwDuplicateIdempotencyKey(idempotencyKey);
		}
		return;
	}

	const redisResult = await claimRedisIdempotencyKey({ storageKey, ttlMs });

	void claimDynamoIdempotencyKey({ storageKey, ttlMs, logger });
	if (redisResult === "duplicate") {
		throwDuplicateIdempotencyKey(idempotencyKey);
	}
};
