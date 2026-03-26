import { ErrCode, RecaseError } from "@autumn/shared";
import { resolveRedisForCustomer } from "@/external/redis/customerRedisRouting.js";
import { getOrgRedis } from "@/external/redis/orgRedisPool.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
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
	items: MutationLogItem[];
};

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

	let rawReceipt: string | null = null;

	if (ctx.org.redis_config) {
		const orgRedis = getOrgRedis({ org: ctx.org });
		rawReceipt = await tryRedisRead(
			() =>
				orgRedis.call("JSON.GET", lockReceiptKey, "$") as Promise<
					string | null
				>,
			orgRedis,
		);
	}

	if (!rawReceipt) {
		rawReceipt = await tryRedisRead(
			() =>
				ctx.redis.call("JSON.GET", lockReceiptKey, "$") as Promise<
					string | null
				>,
		);
	}

	if (!rawReceipt) {
		throw new RecaseError({
			message: `Lock not found for ID: ${lockId}`,
			code: ErrCode.InvalidRequest,
		});
	}

	const receipt = (JSON.parse(rawReceipt) as LockReceipt[])[0];
	if (!receipt?.customer_id) {
		throw new RecaseError({
			message: `Lock receipt is missing customer_id for ID: ${lockId}`,
			code: ErrCode.InvalidRequest,
		});
	}

	if (!receipt.feature_id) {
		throw new RecaseError({
			message: `Lock receipt is missing feature_id for ID: ${lockId}`,
			code: ErrCode.InvalidRequest,
		});
	}

	if (!receipt.items) {
		throw new RecaseError({
			message: `Lock receipt is missing items for ID: ${lockId}`,
			code: ErrCode.InvalidRequest,
		});
	}

	receipt.items = normalizeLockReceiptItems({
		items: receipt.items,
		lockId,
	});

	if (!ctx.customerId && receipt.customer_id) {
		ctx.customerId = receipt.customer_id;
		ctx.redis = resolveRedisForCustomer({
			org: ctx.org,
			customerId: receipt.customer_id,
		});
	}

	return {
		receipt,
		lockReceiptKey,
	};
};
