import { ErrCode, RecaseError } from "@autumn/shared";
import { getRedisV2LockReceiptCandidates } from "@/external/redis/orgRedisUtils/orgRedisMigrationUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchAndClaimLockReceiptV2 } from "@/internal/balances/utils/lockV2/fetchAndClaimLockReceiptV2.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";

export type LockReceipt = {
	lock_id?: string | null;
	customer_id: string;
	feature_id: string;
	entity_id?: string | null;
	expires_at?: number | null;
	region?: string | null;
	overrideLockValue?: number | null;
	items: MutationLogItem[];
};

const fetchAndClaimLockReceiptV2FromCandidates = async ({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}) => {
	const candidates = getRedisV2LockReceiptCandidates({ ctx });

	for (const redisInstance of candidates) {
		const result = await fetchAndClaimLockReceiptV2({
			ctx,
			lockId,
			redisInstance,
		});

		if (result.found) return result;
	}

	return { found: false as const };
};

/**
 * Fetch+claim a lock receipt (pipelined GET + SET NX on a marker key) so the
 * dispatcher can route to runFinalizeLockV2 without a follow-up claim RT.
 * During org Redis migrations, checks both shared and dedicated Redis.
 */
export const fetchLockReceipt = async ({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}) => {
	const v2Result = await fetchAndClaimLockReceiptV2FromCandidates({
		ctx,
		lockId,
	});

	if (!v2Result.found) {
		throw new RecaseError({
			message: `Lock not found for ID: ${lockId}`,
			code: ErrCode.InvalidRequest,
		});
	}

	return {
		receipt: v2Result.receipt,
		lockReceiptKey: v2Result.lockReceiptKey,
		claimed: v2Result.claimed,
		redisInstance: v2Result.redisInstance,
	};
};
