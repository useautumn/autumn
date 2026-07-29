import { getRedisV2LockReceiptCandidates } from "@/external/redis/orgRedisUtils/orgRedisMigrationUtils.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildLockReceiptKey } from "../lock/buildLockReceiptKey.js";
import { buildClaimMarkerKey } from "./buildClaimMarkerKey.js";

/** Best-effort claim-marker DEL after a failed finalize attempt, so an inline
 *  retry or queued replay can reclaim instead of hitting a contested 409. */
export const releaseLockClaimMarker = async ({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}) => {
	const hashedKey = Bun.hash(lockId).toString();
	const claimMarkerKey = buildClaimMarkerKey(
		buildLockReceiptKey({
			orgId: ctx.org.id,
			env: ctx.env,
			lockKey: hashedKey,
		}),
	);

	await Promise.all(
		getRedisV2LockReceiptCandidates({ ctx }).map((redisInstance) =>
			tryRedisOp({
				operation: () => redisInstance.del(claimMarkerKey),
				source: "releaseLockClaimMarker",
				redisInstance,
			}),
		),
	);
};
