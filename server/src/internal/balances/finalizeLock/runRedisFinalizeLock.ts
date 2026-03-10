import type { Redis } from "ioredis";
import { currentRegion } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeRedisDeduction } from "@/internal/balances/utils/deduction/executeRedisDeduction.js";
import { deductionUpdatesToModifiedIds } from "@/internal/balances/utils/sync/deductionUpdatesToModifiedIds.js";
import { globalSyncBatchingManagerV2 } from "@/internal/balances/utils/sync/SyncBatchingManagerV2.js";
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

	let redisResult: Awaited<ReturnType<typeof executeRedisDeduction>>;

	try {
		redisResult = await executeRedisDeduction({
			ctx,
			fullCustomer,
			entityId: receipt.entity_id ?? undefined,
			deductions: [deduction],
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

	const { updates, rolloverUpdates } = redisResult;

	const modifiedCusEntIds = deductionUpdatesToModifiedIds({ updates });
	const rolloverIds = Object.keys(rolloverUpdates);

	if (modifiedCusEntIds.length > 0 || rolloverIds.length > 0) {
		ctx.logger.info(`[QUEUE SYNC] (${receipt.customer_id})`);
		globalSyncBatchingManagerV2.addSyncItem({
			customerId: receipt.customer_id,
			orgId: ctx.org.id,
			env: ctx.env,
			cusEntIds: modifiedCusEntIds,
			rolloverIds,
			region: currentRegion,
		});
	}

	insertFinalizeLockEvent({ ctx, finalizeLockContext });
};
