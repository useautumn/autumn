import { ErrCode, RecaseError } from "@autumn/shared";
import { getRedisV2LockReceiptCandidates } from "@/external/redis/orgRedisUtils/orgRedisMigrationUtils.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchAndClaimLockReceiptV2 } from "@/internal/balances/utils/lockV2/fetchAndClaimLockReceiptV2.js";
import { restoreLockReceiptFromBackup } from "@/internal/balances/utils/lockV2/lockReceiptBackup.js";
import type { DeductionOptions } from "@/internal/balances/utils/types/deductionTypes.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";

export type LockReceipt = {
	lock_id?: string | null;
	customer_id: string;
	feature_id: string;
	entity_id?: string | null;
	expires_at?: number | null;
	region?: string | null;
	overrideLockValue?: number | null;
	properties?: Record<string, unknown> | null;
	overage_behavior?: DeductionOptions["overageBehaviour"] | null;
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
	let unavailableError: unknown;

	for (const redisInstance of candidates) {
		try {
			const result = await fetchAndClaimLockReceiptV2({
				ctx,
				lockId,
				redisInstance,
			});

			if (result.found) return result;
		} catch (error) {
			if (!(error instanceof RedisUnavailableError)) throw error;
			// Another candidate may still hold the receipt mid-migration.
			unavailableError = error;
		}
	}

	if (unavailableError) throw unavailableError;

	return { found: false as const };
};

/** The cache evicted the receipt: put it back from its backup and claim it there. */
const fetchAndClaimRestoredLockReceipt = async ({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}) => {
	const restored = await restoreLockReceiptFromBackup({ ctx, lockId });
	if (!restored) return { found: false as const };

	return fetchAndClaimLockReceiptV2FromCandidates({ ctx, lockId });
};

/**
 * Fetch+claim a lock receipt (pipelined GET + SET NX on a marker key) so the
 * dispatcher can route to runFinalizeLockV2 without a follow-up claim RT.
 * During org Redis migrations, checks both shared and dedicated Redis. A
 * receipt the cache evicted is restored from its misc Redis backup first.
 */
export const fetchLockReceipt = async ({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}) => {
	const cachedResult = await fetchAndClaimLockReceiptV2FromCandidates({
		ctx,
		lockId,
	});
	const v2Result = cachedResult.found
		? cachedResult
		: await fetchAndClaimRestoredLockReceipt({ ctx, lockId });

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
