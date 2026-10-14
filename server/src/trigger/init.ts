import { initErrorReporting, reportError } from "@autumn/errors";
import { tasks } from "@trigger.dev/sdk/v3";
import { createDualLogger } from "@/external/logtail/logtailUtils.js";
import {
	addTriggerToLogs,
	addWorkflowToLogs,
} from "@/utils/logging/addContextToLogs.js";
import { flushTelemetry } from "@/utils/logging/initLogger.js";

initErrorReporting({ tracesRequests: false, ownsProcessErrors: false });

tasks.onFailure(async ({ ctx, task, error }) => {
	const logger = addWorkflowToLogs({
		logger: addTriggerToLogs({
			logger: createDualLogger(),
			triggerContext: {
				run_id: ctx.run.id,
				task_id: task,
				attempt_number: ctx.attempt.number,
			},
		}),
		workflowContext: { id: ctx.run.id, name: task, payload: undefined },
	});
	reportError({ ctx: { logger }, error, operation: `trigger task ${task}` });
	await flushTelemetry();
});
