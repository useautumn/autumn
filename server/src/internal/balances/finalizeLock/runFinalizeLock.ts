import { type FinalizeLockParamsV0, notNullish } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { withRedisFailOpen } from "@/external/redis/utils/withRedisFailOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cancelLockExpiry } from "@/internal/balances/utils/lock/cancelLockExpiry.js";
import { claimLockReceipt } from "@/internal/balances/utils/lock/claimLockReceipt.js";
import { deleteLockReceipt } from "@/internal/balances/utils/lock/deleteLockReceipt.js";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { buildFinalizeLockContext } from "./buildFinalizeLockContext.js";
import { runFinalizeLockV2 } from "./runFinalizeLockV2.js";
import { runRedisFinalizeLock } from "./runRedisFinalizeLock.js";

type RunFinalizeLockArgs = {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
};

export const runFinalizeLock = async (args: RunFinalizeLockArgs) => {
	if (!isFullSubjectRolloutEnabled({ ctx: args.ctx })) {
		return runFinalizeLockInner(args);
	}

	return withRedisFailOpen({
		source: "runFinalizeLock",
		run: () => runFinalizeLockInner(args),
		fallback: () => ({ success: true }),
	});
};

const runFinalizeLockInner = async ({ ctx, params }: RunFinalizeLockArgs) => {
	const fetchedReceipt = await fetchLockReceipt({
		ctx,
		lockId: params.lock_id,
	});

	if (fetchedReceipt.source === "redis_v2") {
		return runFinalizeLockV2({
			ctx,
			params,
			receipt: fetchedReceipt.receipt,
			lockReceiptKey: fetchedReceipt.lockReceiptKey,
			claimed: fetchedReceipt.claimed,
		});
	}

	const finalizeLockContext = await buildFinalizeLockContext({ ctx, params });
	const { lockReceiptKey, receipt, finalValue, lockValue, redisInstance } =
		finalizeLockContext;

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

	// No-op deduction: finalValue == lockValue means nothing changed, just delete the receipt
	if (new Decimal(finalValue).equals(lockValue)) {
		await deleteLockReceipt({ lockReceiptKey, redisInstance });
		return { success: true };
	}

	await runRedisFinalizeLock({ ctx, finalizeLockContext, redisInstance });

	await deleteLockReceipt({ lockReceiptKey, redisInstance });

	return { success: true };
};
