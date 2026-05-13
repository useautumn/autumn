import { ErrCode, RecaseError } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import { getRedisV2LockReceiptCandidates } from "@/external/redis/orgRedisUtils/orgRedisMigrationUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchAndClaimLockReceiptV2 } from "@/internal/balances/utils/lockV2/fetchAndClaimLockReceiptV2.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { buildLockReceiptKey } from "./buildLockReceiptKey.js";

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

export type LockReceiptSource = "redis_v1" | "redis_v2";

const normalizeLockReceiptItems = ({
	items,
	lockId,
}: {
	items: LockReceipt["items"] | Record<string, never> | null | undefined;
	lockId: string;
}): MutationLogItem[] => {
	if (Array.isArray(items)) {
		return items;
	}

	if (items && typeof items === "object" && Object.keys(items).length === 0) {
		return [];
	}

	throw new RecaseError({
		message: `Lock receipt has invalid items for ID: ${lockId}`,
		code: ErrCode.InvalidRequest,
	});
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

const isRedisWrongTypeError = (error: unknown) =>
	error instanceof Error &&
	/WRONGTYPE|wrong Redis type|wrong kind of value/i.test(error.message);

const fetchLegacyLockReceiptJson = async ({
	lockReceiptKey,
}: {
	lockReceiptKey: string;
}) =>
	tryRedisRead(async () => {
		try {
			return (await redis.call("JSON.GET", lockReceiptKey, "$")) as
				| string
				| null;
		} catch (error) {
			if (isRedisWrongTypeError(error)) return null;
			throw error;
		}
	}, redis);

export const fetchLockReceipt = async ({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}) => {
	const hashedKey = Bun.hash(lockId).toString();
	const lockReceiptKey = buildLockReceiptKey({
		orgId: ctx.org.id,
		env: ctx.env,
		lockKey: hashedKey,
	});

	// V2 half doubles as a fetch+claim (pipelined GET + SET NX on a marker key)
	// so the dispatcher can route to runFinalizeLockV2 without a follow-up claim RT.
	// During org Redis migrations, V2 checks both shared and dedicated Redis.
	// V1 half stays a plain JSON.GET — V1 finalize still claims via Lua afterwards.
	const [rawReceiptV1, v2Result] = await Promise.all([
		fetchLegacyLockReceiptJson({ lockReceiptKey }),
		fetchAndClaimLockReceiptV2FromCandidates({
			ctx,
			lockId,
		}),
	]);

	if (v2Result.found) {
		return {
			receipt: v2Result.receipt,
			lockReceiptKey: v2Result.lockReceiptKey,
			source: "redis_v2" as const,
			claimed: v2Result.claimed,
			redisInstance: v2Result.redisInstance,
		};
	}

	if (!rawReceiptV1) {
		throw new RecaseError({
			message: `Lock not found for ID: ${lockId}`,
			code: ErrCode.InvalidRequest,
		});
	}

	const receipt = (JSON.parse(rawReceiptV1) as LockReceipt[])[0];

	const missingField = (["customer_id", "feature_id", "items"] as const).find(
		(field) => !receipt?.[field],
	);
	if (missingField) {
		throw new RecaseError({
			message: `Lock receipt is missing ${missingField} for ID: ${lockId}`,
			code: ErrCode.InvalidRequest,
		});
	}

	receipt.items = normalizeLockReceiptItems({
		items: receipt.items,
		lockId,
	});

	return {
		receipt,
		lockReceiptKey,
		source: "redis_v1" as const,
	};
};
