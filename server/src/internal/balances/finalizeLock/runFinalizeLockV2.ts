import {
	ErrCode,
	type FinalizeLockParamsV0,
	InsufficientBalanceError,
	notNullish,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { Redis } from "ioredis";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cancelLockExpiry } from "@/internal/balances/utils/lock/cancelLockExpiry.js";
import type { LockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { buildFinalizeLockContextV2 } from "@/internal/balances/utils/lockV2/buildFinalizeLockContextV2.js";
import { deleteLockReceiptV2 } from "@/internal/balances/utils/lockV2/deleteLockReceiptV2.js";
import {
	copyLockReceiptToBackup,
	deleteLockReceiptBackupOrThrow,
} from "@/internal/balances/utils/lockV2/lockReceiptBackup.js";
import { releaseLockClaimMarker } from "@/internal/balances/utils/lockV2/releaseLockClaimMarker.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";
import { runRedisFinalizeLockV2 } from "./runRedisFinalizeLockV2.js";

const isBalanceRejection = (error: unknown): boolean => {
	if (error instanceof InsufficientBalanceError) return true;
	if (error instanceof RedisDeductionError) {
		return error.code === RedisDeductionErrorCode.InsufficientBalance;
	}
	return (
		error instanceof Error && error.message.startsWith("INSUFFICIENT_BALANCE|")
	);
};

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
	lockRedisInstance,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
	receipt: LockReceipt;
	lockReceiptKey: string;
	claimed: boolean;
	lockRedisInstance: Redis;
}) => {
	if (!claimed) {
		throw new RecaseError({
			message: "Lock receipt not claimable: RESERVATION_ALREADY_PROCESSING",
			code: ErrCode.InvalidRequest,
			statusCode: 409,
			data: { blockingStatus: "RESERVATION_ALREADY_PROCESSING" },
		});
	}

	// Drop the backup before settling, so it can never put back a receipt for a lock already settled.
	try {
		await deleteLockReceiptBackupOrThrow({ lockReceiptKey });
	} catch (error) {
		await releaseLockClaimMarker({ ctx, lockId: params.lock_id });
		throw new RedisUnavailableError({
			source: "runFinalizeLockV2:deleteLockReceiptBackup",
			reason: "other",
			cause: error,
		});
	}

	let settled = false;
	try {
		const finalizeLockContext = await buildFinalizeLockContextV2({
			ctx,
			params,
			receipt,
			lockReceiptKey,
			redisInstance: lockRedisInstance,
		});
		const { redisInstance, finalValue, lockValue } = finalizeLockContext;

		const balanceChanged = !new Decimal(finalValue).equals(lockValue);
		try {
			if (balanceChanged) {
				await runRedisFinalizeLockV2({ ctx, finalizeLockContext });
			}
		} catch (error) {
			if (!isBalanceRejection(error)) throw error;
			await releaseLockClaimMarker({ ctx, lockId: params.lock_id });
			// The caller's refusal, not a 500: the lock stays open for a finalize that fits.
			if (error instanceof InsufficientBalanceError) throw error;
			throw new InsufficientBalanceError({
				value: new Decimal(finalValue).toNumber(),
				featureId: receipt.feature_id,
			});
		}
		settled = true;

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

		await deleteLockReceiptV2({ lockReceiptKey, redisInstance });
	} catch (error) {
		// Not settled, so the lock is still open and needs its backup again.
		if (!settled) {
			await copyLockReceiptToBackup({
				ctx,
				lockReceiptKey,
				redisInstance: lockRedisInstance,
			});
		}
		throw error;
	}

	return { success: true };
};
