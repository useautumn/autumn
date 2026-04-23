import { ErrCode, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import type { LockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildClaimMarkerKey } from "./buildClaimMarkerKey.js";

/**
 * Marker TTL is a crash-safety net — the marker is always DEL'd on finalize.
 * Chosen well above any realistic claim-race window and well below typical
 * receipt lifetimes so orphans clean up without sticking around forever.
 */
const CLAIM_MARKER_TTL_SECONDS = 3600;

type FetchAndClaimResult =
	| { found: false }
	| {
			found: true;
			claimed: boolean;
			receipt: LockReceipt;
			lockReceiptKey: string;
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
	});
};

/**
 * V2 merged fetch-and-claim. Pipelines a plain `GET <receiptKey>` and a
 * `SET <receiptKey>:claim 1 NX EX` in a single round trip. The receipt
 * payload is never mutated — claim is encoded entirely by ownership of the
 * marker key.
 *
 * Returns `{ found: false }` when the receipt key is absent on redisV2 (the
 * dispatcher uses this to fall through to the V1 finalize path). When
 * `found` is true, `claimed` reports whether this caller won the race; the
 * dispatcher throws on `found && !claimed` rather than falling through to
 * V1, because a present-but-contested receipt IS a V2 lock.
 */
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

	// Pipeline GET + SET NX EX as a single round trip. tryRedisWrite wraps the
	// whole `.exec()` since any error (or unavailable redis) invalidates both
	// results atomically from our perspective.
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
	};
};
