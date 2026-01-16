import type { AppEnv } from "@autumn/shared";
import type { Context } from "@hatchet-dev/typescript-sdk/v1/client/worker/context";
import * as Sentry from "@sentry/bun";
import { db } from "@/db/initDrizzle.js";
import { createLogger } from "@/external/logtail/logtailUtils.js";
import { getSentryTags } from "@/external/sentry/sentryUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { addWorkflowToLogs } from "@/utils/logging/addContextToLogs.js";
import { createWorkerContext } from "../createWorkerContext.js";

type BaseWorkflowInput = {
	orgId: string;
	env: AppEnv;
	customerId?: string;
};

/**
 * Creates a wrapped workflow task handler that:
 * 1. Initializes the AutumnContext (autumnContext) from input
 * 2. Wraps execution in try/catch for error handling
 * 3. Logs errors and captures them in Sentry with proper tags
 * 4. Re-throws so Hatchet also logs the failure
 */
export const createWorkflowTask = <TInput extends BaseWorkflowInput, TOutput>({
	handler,
}: {
	handler: (params: {
		input: TInput;
		autumnContext: AutumnContext;
	}) => Promise<TOutput>;
}): ((input: TInput, hatchetCtx: Context<TInput>) => Promise<TOutput>) => {
	return async (input: TInput, hatchetCtx: Context<TInput>) => {
		const { orgId, env, customerId } = input;
		const logger = createLogger();

		// Get workflow/task name from Hatchet context
		const workflowName = hatchetCtx.workflowName();
		const taskName = hatchetCtx.taskName();
		const name = `${workflowName}/${taskName}`;
		const workflowMetadata = hatchetCtx.additionalMetadata();

		const workflowLogger = addWorkflowToLogs({
			logger,
			workflowContext: {
				id: workflowMetadata.workflowId ?? generateId("workflow"),
				payload: input,
				name: hatchetCtx.workflowName(),
			},
		});

		const autumnContext = await createWorkerContext({
			db,
			payload: input,
			logger: workflowLogger,
		});

		autumnContext?.logger.info(
			`[${workflowName}] Running for customer ${customerId}, orgId: ${orgId}`,
		);

		if (!autumnContext) {
			const error = new Error(
				`[${name}] Failed to create worker context for org: ${orgId}`,
			);
			logger.error(error.message);
			Sentry.captureException(error, {
				tags: {
					workflow: workflowName,
					task: taskName,
					org_id: orgId,
					env,
					customer_id: customerId,
				},
			});
			throw error;
		}

		try {
			return await handler({ input, autumnContext });
		} catch (error) {
			// Log error with context
			autumnContext.logger.error(`[${name}] Task failed: ${error}`, {
				data: { input },
			});

			// Capture in Sentry with proper tags
			Sentry.captureException(error, {
				tags: {
					...getSentryTags({
						ctx: autumnContext,
						customerId,
					}),
					workflow: workflowName,
					task: taskName,
				},
				extra: {
					input,
				},
			});

			// Re-throw so Hatchet marks the task as failed
			throw error;
		}
	};
};
