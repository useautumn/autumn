import { releaseDynamoIdempotencyKey } from "@/external/aws/dynamodb/idempotencyKeys/operations/releaseDynamoIdempotencyKey.js";
import { releaseRedisIdempotencyKey } from "@/external/redis/idempotencyKeys/operations/releaseRedisIdempotencyKey.js";
import { isIdempotencyDynamoReadEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { buildIdempotencyStorageKey } from "../idempotencyKeyUtils.js";

/** Mirrors checkIdempotencyKey: the authority store's delete is awaited, the
 *  other store's is fire-and-forget. Both swallow their own errors. */
export const releaseIdempotencyKey = async ({
	orgId,
	env,
	idempotencyKey,
}: {
	orgId: string;
	env: string;
	idempotencyKey: string;
}): Promise<void> => {
	const { storageKey } = buildIdempotencyStorageKey({
		orgId,
		env,
		idempotencyKey,
	});

	if (isIdempotencyDynamoReadEnabled()) {
		void releaseRedisIdempotencyKey({ storageKey });
		await releaseDynamoIdempotencyKey({ storageKey });
		return;
	}

	void releaseDynamoIdempotencyKey({ storageKey });
	await releaseRedisIdempotencyKey({ storageKey });
};
