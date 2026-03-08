import { ErrCode, RecaseError } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { buildLockReceiptKey } from "./buildLockReceiptKey.js";

export type LockReceipt = {
	customer_id: string;
	feature_id: string;
	entity_id?: string | null;
	items: MutationLogItem[];
};

export const fetchLockReceipt = async ({
	ctx,
	lockKey,
}: {
	ctx: AutumnContext;
	lockKey: string;
}) => {
	const hashedKey = Bun.hash(lockKey).toString();
	const lockReceiptKey = buildLockReceiptKey({
		orgId: ctx.org.id,
		env: ctx.env,
		lockKey: hashedKey,
	});

	const rawReceipt = await tryRedisRead(
		() => redis.call("JSON.GET", lockReceiptKey, "$") as Promise<string | null>,
	);

	if (!rawReceipt) {
		throw new RecaseError({
			message: `Lock not found for key: ${lockKey}`,
			code: ErrCode.InvalidRequest,
		});
	}

	const receipt = (JSON.parse(rawReceipt) as LockReceipt[])[0];
	if (!receipt?.customer_id) {
		throw new RecaseError({
			message: `Lock receipt is missing customer_id for key: ${lockKey}`,
			code: ErrCode.InvalidRequest,
		});
	}

	if (!receipt.feature_id) {
		throw new RecaseError({
			message: `Lock receipt is missing feature_id for key: ${lockKey}`,
			code: ErrCode.InvalidRequest,
		});
	}

	if (!receipt.items) {
		throw new RecaseError({
			message: `Lock receipt is missing items for key: ${lockKey}`,
			code: ErrCode.InvalidRequest,
		});
	}

	return {
		receipt,
		lockReceiptKey,
	};
};
