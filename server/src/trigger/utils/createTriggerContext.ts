import type { AppEnv } from "@autumn/shared";
import type { Context as TriggerRunContext } from "@trigger.dev/sdk/v3";
import { db } from "@/db/initDrizzle.js";
import {
	createDualLogger,
	type Logger,
} from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createWorkerContext } from "@/queue/createWorkerContext.js";
import { addTriggerToLogs } from "@/utils/logging/addContextToLogs.js";

/**
 * Build an `AutumnContext` for a trigger.dev task run. Uses the dual
 * logger (stdout + axiom) and tags every line with run/task/attempt ids.
 */
export const createTriggerContext = async ({
	orgId,
	env,
	triggerCtx,
}: {
	orgId: string;
	env: AppEnv;
	triggerCtx: TriggerRunContext;
}): Promise<{ ctx: AutumnContext; logger: Logger }> => {
	const logger = addTriggerToLogs({
		logger: createDualLogger(),
		triggerContext: {
			run_id: triggerCtx.run.id,
			task_id: triggerCtx.task.id,
			attempt_number: triggerCtx.attempt.number,
		},
	});

	const ctx = await createWorkerContext({
		db,
		payload: { orgId, env, requestId: triggerCtx.run.id },
		logger,
	});

	if (!ctx)
		throw new Error(
			`createTriggerContext: failed to build context for org=${orgId} env=${env}`,
		);

	return { ctx, logger };
};
