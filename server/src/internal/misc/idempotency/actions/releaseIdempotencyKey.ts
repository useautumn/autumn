import { releaseDynamoIdempotencyKey } from "@/external/aws/dynamodb/idempotencyKeys/operations/releaseDynamoIdempotencyKey.js";
import { releaseRedisIdempotencyKey } from "@/external/redis/actions/idempotencyKeys/operations/releaseRedisIdempotencyKey.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isIdempotencyDynamoReadEnabled } from "@/internal/misc/edgeConfigs/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { buildIdempotencyStorageKey } from "../idempotencyKeyUtils.js";

/** Mirrors checkIdempotencyKey: the authority store's delete is awaited, the
 *  other store's is fire-and-forget. Both swallow their own errors. */
export const releaseIdempotencyKey = async ({
	ctx,
	idempotencyKey,
}: {
	ctx: AutumnContext;
	idempotencyKey: string;
}): Promise<void> => {
	const { storageKey } = buildIdempotencyStorageKey({
		orgId: ctx.org.id,
		env: ctx.env,
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
