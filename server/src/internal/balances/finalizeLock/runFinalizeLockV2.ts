import {
	ErrCode,
	type FinalizeLockParamsV0,
	notNullish,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cancelLockExpiry } from "@/internal/balances/utils/lock/cancelLockExpiry.js";
import type { LockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { buildFinalizeLockContextV2 } from "@/internal/balances/utils/lockV2/buildFinalizeLockContextV2.js";
import { deleteLockReceiptV2 } from "@/internal/balances/utils/lockV2/deleteLockReceiptV2.js";
import { runRedisFinalizeLockV2 } from "./runRedisFinalizeLockV2.js";

/**
 * V2 finalize. Receives the receipt + claim outcome from the dispatcher
 * (`fetchAndClaimLockReceiptV2` runs pipelined GET + SET NX alongside the
 * V1 JSON.GET). Claim is encoded by ownership of the `<receiptKey>:claim`
 * marker key; `claimed === false` means another finalizer holds it.
 */
export const runFinalizeLockV2 = async ({
	ctx,
	params,
	receipt,
	lockReceiptKey,
	claimed,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
	receipt: LockReceipt;
	lockReceiptKey: string;
	claimed: boolean;
}) => {
	if (!claimed) {
		throw new RecaseError({
			message: "Lock receipt not claimable: RESERVATION_ALREADY_PROCESSING",
			code: ErrCode.InvalidRequest,
			statusCode: 409,
			data: { blockingStatus: "RESERVATION_ALREADY_PROCESSING" },
		});
	}

	const finalizeLockContext = await buildFinalizeLockContextV2({
		ctx,
		params,
		receipt,
		lockReceiptKey,
	});
	const { redisInstance, finalValue, lockValue } = finalizeLockContext;

	try {
		if (notNullish(receipt.expires_at)) {
			await cancelLockExpiry({
				orgId: ctx.org.id,
				env: ctx.env,
				hashedKey: Bun.hash(params.lock_id).toString(),
			});
		}
	} catch (error) {
		ctx.logger.error(`Failed to cancel lock expiry: ${error}`);
	}

	if (new Decimal(finalValue).equals(lockValue)) {
		await deleteLockReceiptV2({ lockReceiptKey, redisInstance });
		return { success: true };
	}

	await runRedisFinalizeLockV2({ ctx, finalizeLockContext });
	await deleteLockReceiptV2({ lockReceiptKey, redisInstance });

	return { success: true };
};
