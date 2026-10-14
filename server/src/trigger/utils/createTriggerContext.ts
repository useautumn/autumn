import type { AppEnv } from "@autumn/shared";
import type { Context as TriggerRunContext } from "@trigger.dev/sdk/v3";
import { type DrizzleCli, db as dbGeneral } from "@/db/initDrizzle.js";
import {
	createDualLogger,
	type Logger,
} from "@/external/logtail/logtailUtils.js";
import { warmOrgRedis } from "@/external/redis/orgRedisPool.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { startEdgeConfigPolling } from "@/internal/misc/edgeConfig/startEdgeConfigPolling.js";
import { rolloutEdgeConfig } from "@/internal/misc/rollouts/rolloutConfigStore.js";
import { createWorkerContext } from "@/queue/createWorkerContext.js";
import { addTriggerToLogs } from "@/utils/logging/addContextToLogs.js";

const TRIGGER_EDGE_CONFIGS = [rolloutEdgeConfig] as const;

export const createTriggerContext = async ({
	orgId,
	env,
	triggerCtx,
	customerId,
	db = dbGeneral,
}: {
	orgId: string;
	env: AppEnv;
	triggerCtx: TriggerRunContext;
	customerId?: string;
	db?: DrizzleCli;
}): Promise<{ ctx: AutumnContext; logger: Logger }> => {
	const logger = addTriggerToLogs({
		logger: createDualLogger(),
		triggerContext: {
			run_id: triggerCtx.run.id,
			task_id: triggerCtx.task.id,
			attempt_number: triggerCtx.attempt.number,
		},
	});

	await startEdgeConfigPolling({ stores: TRIGGER_EDGE_CONFIGS, logger });

	const ctx = await createWorkerContext({
		db,
		payload: { orgId, env, customerId, requestId: triggerCtx.run.id },
		logger,
	});

	if (!ctx)
		throw new Error(
			`createTriggerContext: failed to build context for org=${orgId} env=${env}`,
		);

	ctx.insideTriggerTask = true;

	await warmOrgRedis({ org: ctx.org });

	return { ctx, logger };
};
