import { type FinalizeLockParamsV0, notNullish } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cancelLockExpiry } from "@/internal/balances/utils/lock/cancelLockExpiry.js";
import { claimLockReceipt } from "@/internal/balances/utils/lock/claimLockReceipt.js";
import { deleteLockReceipt } from "@/internal/balances/utils/lock/deleteLockReceipt.js";
import { buildFinalizeLockContext } from "./buildFinalizeLockContext.js";
import { runRedisFinalizeLock } from "./runRedisFinalizeLock.js";

export const runFinalizeLock = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
}) => {
	const finalizeLockContext = await buildFinalizeLockContext({ ctx, params });
	const { lockReceiptKey, receipt, finalValue, lockValue } =
		finalizeLockContext;

	// Claim on the receipt's origin region to prevent cross-region double-claim
	const { redisInstance } = await claimLockReceipt({
		lockReceiptKey,
		receiptRegion: receipt.region,
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

	// No-op deduction: finalValue == lockValue means nothing changed, just delete the receipt
	if (new Decimal(finalValue).equals(lockValue)) {
		await deleteLockReceipt({ lockReceiptKey, redisInstance });
		return { success: true };
	}

	await runRedisFinalizeLock({ ctx, finalizeLockContext, redisInstance });

	await deleteLockReceipt({ lockReceiptKey, redisInstance });

	return { success: true };
};
