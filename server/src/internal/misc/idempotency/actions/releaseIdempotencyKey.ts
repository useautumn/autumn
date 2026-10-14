import { releaseDynamoIdempotencyKey } from "@/external/aws/dynamodb/idempotencyKeys/operations/releaseDynamoIdempotencyKey.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildIdempotencyStorageKey } from "../idempotencyKeyUtils.js";

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

	await releaseDynamoIdempotencyKey({ storageKey });
};
