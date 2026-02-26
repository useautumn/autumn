import type { Message } from "@aws-sdk/client-sqs";
import * as Sentry from "@sentry/bun";
import type { Logger } from "pino";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { runActionHandlerTask } from "@/internal/analytics/runActionHandlerTask.js";
import { handleAutoTopUpJob } from "@/internal/balances/autoTopUp/handleAutoTopUpJob.js";
import { runInsertEventBatch } from "@/internal/balances/events/runInsertEventBatch.js";
import { syncItemV3 } from "@/internal/balances/utils/sync/syncItemV3.js";
import { grantCheckoutReward } from "@/internal/billing/v2/workflows/grantCheckoutReward/grantCheckoutReward.js";
import { sendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/sendProductsUpdated.js";
import { batchResetCustomerEntitlements } from "@/internal/customers/actions/resetCustomerEntitlements/batchResetCustomerEntitlements.js";
import { runClearCreditSystemCacheTask } from "@/internal/features/featureActions/runClearCreditSystemCacheTask.js";
import { generateFeatureDisplay } from "@/internal/features/workflows/generateFeatureDisplay.js";
import { runMigrationTask } from "@/internal/migrations/runMigrationTask.js";
import { runRewardMigrationTask } from "@/internal/migrations/runRewardMigrationTask.js";
import { detectBaseVariant } from "@/internal/products/productUtils/detectProductVariant.js";
import { runTriggerCheckoutReward } from "@/internal/rewards/triggerCheckoutReward.js";
import { generateId } from "@/utils/genUtils.js";
import { addWorkflowToLogs } from "@/utils/logging/addContextToLogs.js";
import { setSentryTags } from "../external/sentry/sentryUtils.js";
import { createWorkerContext } from "./createWorkerContext.js";
import { JobName } from "./JobName.js";

const actionHandlers = [
	JobName.HandleProductsUpdated,
	JobName.HandleCustomerCreated,
];

export interface SqsJob {
	name: string;
	data: any;
}

export const processMessage = async ({
	message,
	db,
}: {
	message: Message;
	db: DrizzleCli;
}) => {
	if (!message.Body) {
		console.warn("Received message without body");
		return;
	}

	const job: SqsJob = JSON.parse(message.Body);

	const workerLogger = addWorkflowToLogs({
		logger: logger,
		workflowContext: {
			id: message.MessageId ?? generateId("job"),
			name: job.name,
			payload: job.data,
		},
	});

	workerLogger.info(`Processing message: ${job.name}`);

	try {
		if (job.name === JobName.DetectBaseVariant) {
			await detectBaseVariant({
				db,
				curProduct: job.data.curProduct,
				logger: workerLogger as Logger,
			});
			return;
		}

		if (job.name === JobName.ClearCreditSystemCustomerCache) {
			await runClearCreditSystemCacheTask({
				db,
				payload: job.data,
				logger: workerLogger,
			});
			return;
		}

		// Jobs below need worker context
		const ctx = await createWorkerContext({
			db,
			payload: job.data,
			logger: workerLogger,
		});

		if (ctx) {
			setSentryTags({
				ctx,
				messageId: message.MessageId,
			});
		}

		if (job.name === JobName.Migration) {
			if (!ctx) {
				workerLogger.error("No context found for migration job");
				return;
			}
			await runMigrationTask({ ctx, payload: job.data });
			return;
		}

		if (job.name === JobName.GenerateFeatureDisplay) {
			if (!ctx) {
				workerLogger.error("No context found for generate feature display job");
				return;
			}
			await generateFeatureDisplay({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.SendProductsUpdated) {
			if (!ctx) {
				workerLogger.error("No context found for send products updated job");
				return;
			}
			await sendProductsUpdated({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (actionHandlers.includes(job.name as JobName)) {
			// Note: action handlers need BullMQ queue for nested jobs
			// This will need to be refactored when migrating action handlers to SQS
			await runActionHandlerTask({
				ctx,
				jobName: job.name as JobName,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.RewardMigration) {
			await runRewardMigrationTask({
				db,
				payload: job.data,
				logger: workerLogger,
			});
			return;
		}

		if (job.name === JobName.SyncBalanceBatchV3) {
			if (!ctx) {
				workerLogger.error("No context found for sync balance batch v3 job");
				return;
			}

			await syncItemV3({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.InsertEventBatch) {
			await runInsertEventBatch({
				db,
				payload: job.data,
				logger: workerLogger as Logger,
			});
			return;
		}

		if (job.name === JobName.TriggerCheckoutReward) {
			if (!ctx) {
				workerLogger.error("No context found for trigger checkout reward job");
				return;
			}
			await runTriggerCheckoutReward({
				ctx,
				payload: job.data,
			});
		}

		if (job.name === JobName.GrantCheckoutReward) {
			if (!ctx) {
				workerLogger.error("No context found for grant checkout reward job");
				return;
			}
			await grantCheckoutReward({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.BatchResetCusEnts) {
			if (!ctx) {
				workerLogger.error("No context found for batch reset cus ents job");
				return;
			}
			await batchResetCustomerEntitlements({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.AutoTopUp) {
			if (!ctx) {
				workerLogger.error("No context found for auto top-up job");
				return;
			}
			await handleAutoTopUpJob({
				ctx,
				payload: job.data,
			});
			return;
		}
	} catch (error) {
		Sentry.captureException(error);
		if (error instanceof Error) {
			workerLogger.error(`Failed to process SQS job: ${job.name}`, {
				jobName: job.name,
				error: {
					message: error.message,
					stack: error.stack,
				},
			});
		}
	}
};
