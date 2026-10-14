import { ErrCode, RecaseError } from "@autumn/shared";
import { claimDynamoIdempotencyKey } from "@/external/aws/dynamodb/idempotencyKeys/operations/claimDynamoIdempotencyKey.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildIdempotencyStorageKey } from "../idempotencyKeyUtils.js";

export const checkIdempotencyKey = async ({
	ctx,
	idempotencyKey,
	ttlMs,
}: {
	ctx: AutumnContext;
	idempotencyKey: string;
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

	const result = await claimDynamoIdempotencyKey({ storageKey, ttlMs, logger });

	if (result === "duplicate") {
		throw new RecaseError({
			message: `Another request with idempotency key ${idempotencyKey} has already been received`,
			code: ErrCode.DuplicateIdempotencyKey,
			statusCode: 409,
		});
	}
};
