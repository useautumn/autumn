import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeLegacyRedisDeductionWithBalanceSync } from "@/internal/balances/utils/deduction/executeLegacyRedisDeductionWithBalanceSync.js";
import { RedisDeductionError } from "@/internal/balances/utils/types/redisDeductionError.js";
import type { FinalizeLockContext } from "./buildFinalizeLockContext.js";
import { insertFinalizeLockEvent } from "./insertFinalizeLockEvent.js";
import { runPostgresFinalizeLock } from "./runPostgresFinalizeLock.js";

export const runRedisFinalizeLock = async ({
	ctx,
	finalizeLockContext,
	redisInstance,
}: {
	ctx: AutumnContext;
	finalizeLockContext: FinalizeLockContext;
	redisInstance?: Redis;
}) => {
	const {
		receipt,
		fullCustomer,

		deduction,
		deductionOptions,
	} = finalizeLockContext;

	try {
		await executeLegacyRedisDeductionWithBalanceSync({
			ctx,
			fullCustomer,
			entityId: receipt.entity_id ?? undefined,
			featureDeductions: [deduction],
			deductionOptions,
			redisInstance,
		});
	} catch (error) {
		if (error instanceof RedisDeductionError && error.shouldFallback()) {
			ctx.logger.warn(
				`[FINALIZE LOCK] Falling back to Postgres: ${error.code}`,
			);
			await runPostgresFinalizeLock({ ctx, finalizeLockContext });
			return;
		}
		throw error;
	}

	insertFinalizeLockEvent({ ctx, finalizeLockContext });
};
