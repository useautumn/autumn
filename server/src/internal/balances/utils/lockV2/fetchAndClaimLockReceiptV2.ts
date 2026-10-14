import { ErrCode, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import type { LockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildClaimMarkerKey } from "./buildClaimMarkerKey.js";

const CLAIM_MARKER_TTL_SECONDS = 3600;

type FetchAndClaimResult =
	| { found: false }
	| {
			found: true;
			claimed: boolean;
			receipt: LockReceipt;
			lockReceiptKey: string;
			redisInstance: Redis;
	  };

const normalizeLockReceiptItems = ({
	items,
	lockId,
}: {
	items: LockReceipt["items"] | Record<string, never> | null | undefined;
	lockId: string;
}): MutationLogItem[] => {
	if (Array.isArray(items)) return items;

	if (items && typeof items === "object" && Object.keys(items).length === 0) {
		return [];
	}

	throw new RecaseError({
		message: `Lock receipt has invalid items for ID: ${lockId}`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

export const fetchAndClaimLockReceiptV2 = async ({
	ctx,
	lockId,
	redisInstance,
}: {
	ctx: AutumnContext;
	lockId: string;
	redisInstance: Redis;
}): Promise<FetchAndClaimResult> => {
	const hashedKey = Bun.hash(lockId).toString();
	const lockReceiptKey = buildLockReceiptKey({
		orgId: ctx.org.id,
		env: ctx.env,
		lockKey: hashedKey,
	});
	const claimMarkerKey = buildClaimMarkerKey(lockReceiptKey);

	const execResult = await tryRedisWrite(
		() =>
			redisInstance
				.pipeline()
				.get(lockReceiptKey)
				.set(claimMarkerKey, "1", "EX", CLAIM_MARKER_TTL_SECONDS, "NX")
				.exec(),
		redisInstance,
	);

	if (!execResult) return { found: false };

	const [getReply, setReply] = execResult;
	const getErr = getReply?.[0];
	const setErr = setReply?.[0];
	if (getErr || setErr) return { found: false };

	const raw = getReply?.[1] as string | null | undefined;
	const claimResult = setReply?.[1] as "OK" | null | undefined;

	if (!raw) return { found: false };

	const receipt = JSON.parse(raw) as LockReceipt;

	const missingField = (["customer_id", "feature_id", "items"] as const).find(
		(field) => !receipt?.[field],
	);
	if (missingField) {
		throw new RecaseError({
			message: `Lock receipt is missing ${missingField} for ID: ${lockId}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	receipt.items = normalizeLockReceiptItems({
		items: receipt.items,
		lockId,
	});

	return {
		found: true,
		claimed: claimResult === "OK",
		receipt,
		lockReceiptKey,
		redisInstance,
	};
};
