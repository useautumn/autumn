import { type FinalizeLockParamsV0, notNullish } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cancelLockExpiry } from "@/internal/balances/utils/lock/cancelLockExpiry.js";
import { claimLockReceipt } from "@/internal/balances/utils/lock/claimLockReceipt.js";
import { deleteLockReceipt } from "@/internal/balances/utils/lock/deleteLockReceipt.js";
import type { LockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { buildFinalizeLockContextV2 } from "@/internal/balances/utils/lockV2/buildFinalizeLockContextV2.js";
import { runRedisFinalizeLockV2 } from "./runRedisFinalizeLockV2.js";

export const runFinalizeLockV2 = async ({
	ctx,
	params,
	receipt,
	lockReceiptKey,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
	receipt: LockReceipt;
	lockReceiptKey: string;
}) => {
	const finalizeLockContext = await buildFinalizeLockContextV2({
		ctx,
		params,
		receipt,
		lockReceiptKey,
	});
	const { redisInstance, finalValue, lockValue } = finalizeLockContext;

	await claimLockReceipt({
		lockReceiptKey,
		redisInstance,
	});

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
		await deleteLockReceipt({ lockReceiptKey, redisInstance });
		return { success: true };
	}

	await runRedisFinalizeLockV2({ ctx, finalizeLockContext });
	await deleteLockReceipt({ lockReceiptKey, redisInstance });

	return { success: true };
};
