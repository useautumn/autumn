import { ErrCode, RecaseError } from "@autumn/shared";
import type { Message } from "@aws-sdk/client-sqs";
import * as Sentry from "@sentry/bun";
import chalk from "chalk";
import type { Logger } from "pino";
import { isTransientDbError } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";
import {
	runStripeWebhookReplay,
	StripeWebhookReplayInFlightError,
} from "@/external/stripe/webhookReplay/runStripeWebhookReplay.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runActionHandlerTask } from "@/internal/analytics/runActionHandlerTask.js";
import { autoTopup } from "@/internal/balances/autoTopUp/autoTopup.js";
import { batchResetCustomerEntitlementsV2 } from "@/internal/balances/batchReset/batchResetCustomerEntitlementsV2.js";
import { runInsertEventBatch } from "@/internal/balances/events/runInsertEventBatch.js";
import { expireLock } from "@/internal/balances/finalizeLock/expireLock.js";
import { runQueuedFinalizeLock } from "@/internal/balances/finalizeLock/runQueuedFinalizeLock.js";
import { runQueuedTrack } from "@/internal/balances/track/runQueuedTrack.js";
import { runUpdateBalanceV2 } from "@/internal/balances/updateBalance/v2/updateBalanceV2.js";
import { refreshEntityAggregateCache } from "@/internal/balances/utils/refreshEntityAggregate/index.js";
import { syncItemV4 } from "@/internal/balances/utils/sync/syncItemV4.js";
import { syncItemV5 } from "@/internal/balances/utils/sync/syncItemV5.js";
import { grantCheckoutReward } from "@/internal/billing/v2/workflows/grantCheckoutReward/grantCheckoutReward.js";
import { sendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/sendProductsUpdated.js";
import { storeDeferredInvoiceLineItems } from "@/internal/billing/v2/workflows/storeDeferredInvoiceLineItems/storeDeferredInvoiceLineItems.js";
import { storeInvoiceLineItems } from "@/internal/billing/v2/workflows/storeInvoiceLineItems/storeInvoiceLineItems.js";
import { batchResetCustomerEntitlements } from "@/internal/customers/actions/resetCustomerEntitlements/batchResetCustomerEntitlements.js";
import { replayFailedCustomerCreation } from "@/internal/customers/recovery/replayFailedCustomerCreation.js";
import { isEntityCreationRecoveryPayload } from "@/internal/entities/recovery/entityCreationRecoveryTypes.js";
import { replayFailedEntityCreation } from "@/internal/entities/recovery/replayFailedEntityCreation.js";
import { runClearCreditSystemCacheTask } from "@/internal/features/featureActions/runClearCreditSystemCacheTask.js";
import { generateFeatureDisplay } from "@/internal/features/workflows/generateFeatureDisplay.js";
import { runMigrationTask } from "@/internal/migrations/runMigrationTask.js";
import { runRewardMigrationTask } from "@/internal/migrations/runRewardMigrationTask.js";
import { isBatchResetEnabled } from "@/internal/misc/batchReset/batchResetConfigStore.js";
import { detectBaseVariant } from "@/internal/products/productUtils/detectProductVariant.js";
import { runTriggerCheckoutReward } from "@/internal/rewards/actions/triggerCheckoutReward.js";
import { generateId } from "@/utils/genUtils.js";
import { addWorkflowToLogs } from "@/utils/logging/addContextToLogs.js";
import { logContextExtras } from "@/utils/logging/logContextExtras.js";
import { withWorkerSpan } from "@/utils/otel/withWorkerSpan.js";
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

const isClaimContestedError = ({ error }: { error: unknown }): boolean => {
	if (!(error instanceof RecaseError)) return false;
	const { data } = error;
	return (
		typeof data === "object" &&
		data !== null &&
		"blockingStatus" in data &&
		data.blockingStatus === "RESERVATION_ALREADY_PROCESSING"
	);
};

export const shouldRetrySqsJobError = ({
	jobName,
	error,
}: {
	jobName: string;
	error: unknown;
}) => {
	switch (jobName) {
		case JobName.CustomerCreationRecovery:
			return isTransientDbError({ error }) || isTransientRedisError({ error });
		case JobName.SyncBalanceBatchV4:
		case JobName.RefreshEntityAggregate:
			return isTransientDbError({ error });
		// Signal jobs are meaningless without Redis: an unreachable Redis must
		// leave the message in SQS for redelivery, not swallow-and-ack.
		case JobName.SyncCustomerDirty:
		case JobName.Track:
		case JobName.UpdateBalance:
			return isTransientDbError({ error }) || isTransientRedisError({ error });
		// Finalize replays also redeliver while a dying attempt's claim marker
		// clears — dropping one leaks the customer's reserved balance.
		case JobName.FinalizeLock:
			return (
				isTransientDbError({ error }) ||
				isTransientRedisError({ error }) ||
				isClaimContestedError({ error })
			);
		// Top-up shares the customer billing lock — retry on collision with attach or
		// checkout, safe only while AUTO_TOPUP_RETRY_SUPPRESSION_MS outlasts the chain.
		case JobName.AutoTopUp:
			return (
				error instanceof RecaseError && error.code === ErrCode.LockAlreadyExists
			);
		case JobName.StripeWebhookReplay:
			return (
				error instanceof StripeWebhookReplayInFlightError ||
				isTransientDbError({ error }) ||
				isTransientRedisError({ error })
			);
		default:
			return false;
	}
};

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

	const workflowId = message.MessageId ?? generateId("job");

	const workerLogger = addWorkflowToLogs({
		logger: logger,
		workflowContext: {
			id: workflowId,
			name: job.name,
			payload: job.data,
		},
	});

	workerLogger.debug(
		`${chalk.yellowBright(`Processing message: ${job.name}`)}`,
	);

	let workerCtx: AutumnContext | undefined;

	const executeJob = async () => {
		if (job.name === JobName.BatchResetCusEnts && !isBatchResetEnabled()) {
			workerLogger.info(
				"Batch reset skipped because the edge config is disabled",
			);
			return;
		}

		// Reset-ID payload (no orgId/env): builds its own per-org contexts.
		if (job.name === JobName.BatchResetCustomerEntitlementsV2) {
			await batchResetCustomerEntitlementsV2({
				db,
				logger: workerLogger,
				payload: job.data,
			});
			return;
		}

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
		const usesCustomerCache =
			job.name === JobName.Track ||
			job.name === JobName.UpdateBalance ||
			job.name === JobName.FinalizeLock;
		const ctx = await createWorkerContext({
			db,
			payload: job.data,
			logger: workerLogger,
			skipCache: !usesCustomerCache,
		});
		workerCtx = ctx;

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

		if (job.name === JobName.CustomerCreationRecovery) {
			if (!ctx) {
				throw new Error("No context found for customer creation recovery job");
			}
			if (isEntityCreationRecoveryPayload(job.data)) {
				await replayFailedEntityCreation({ ctx, payload: job.data });
			} else {
				await replayFailedCustomerCreation({ ctx, payload: job.data });
			}
			return;
		}

		if (job.name === JobName.StripeWebhookReplay) {
			if (!ctx) {
				workerLogger.error("No context found for stripe webhook replay job");
				return;
			}
			await runStripeWebhookReplay({
				ctx,
				payload: job.data,
			});
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

		if (job.name === JobName.SyncBalanceBatchV4) {
			if (!ctx) {
				workerLogger.error("No context found for sync balance batch v4 job");
				return;
			}

			await syncItemV4({ ctx, payload: job.data });
			return;
		}

		if (job.name === JobName.SyncCustomerDirty) {
			if (!ctx) {
				workerLogger.error("No context found for sync customer dirty job");
				return;
			}

			await syncItemV5({ ctx, payload: job.data });
			return;
		}

		if (job.name === JobName.Track) {
			if (!ctx) {
				workerLogger.error("No context found for track job");
				return;
			}

			await runQueuedTrack({
				ctx,
				body: job.data.body,
				apiVersion: job.data.apiVersion,
				validateTrackBodyIdempotencyKey:
					job.data.validateTrackBodyIdempotencyKey !== false,
			});
			return;
		}

		if (job.name === JobName.UpdateBalance) {
			if (!ctx) {
				workerLogger.error("No context found for update balance job");
				return;
			}

			await runUpdateBalanceV2({
				ctx,
				params: job.data.params,
				targetBalance: job.data.targetBalance,
			});

			return;
		}

		if (job.name === JobName.RefreshEntityAggregate) {
			if (!ctx) {
				workerLogger.error("No context found for refresh entity aggregate job");
				return;
			}

			await refreshEntityAggregateCache({
				ctx,
				customerId: job.data.customerId,
				internalFeatureIds: job.data.internalFeatureIds,
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
			await autoTopup({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.StoreInvoiceLineItems) {
			if (!ctx) {
				workerLogger.error("No context found for store invoice line items job");
				return;
			}
			await storeInvoiceLineItems({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.StoreDeferredInvoiceLineItems) {
			if (!ctx) {
				workerLogger.error(
					"No context found for store deferred invoice line items job",
				);
				return;
			}
			await storeDeferredInvoiceLineItems({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.ExpireLockReceipt) {
			if (!ctx) {
				workerLogger.error("No context found for expire lock receipt job");
				return;
			}
			await expireLock({
				ctx,
				payload: job.data,
			});
			return;
		}

		if (job.name === JobName.FinalizeLock) {
			if (!ctx) {
				workerLogger.error("No context found for finalize lock job");
				return;
			}
			await runQueuedFinalizeLock({
				ctx,
				params: job.data.params,
			});
			return;
		}
	};

	// Queue dwell = SQS SentTimestamp → processing start. Total message age:
	// includes prior delivery attempts on retry (SentTimestamp never resets).
	const sentAtMs = Number(message.Attributes?.SentTimestamp);
	const receiveCount = Number(message.Attributes?.ApproximateReceiveCount);

	try {
		await withWorkerSpan({
			workflowName: job.name,
			workflowId,
			tenantAttrs: {
				org_id: job.data?.orgId,
				env: job.data?.env,
				customer_id: job.data?.customerId,
			},
			attributes: {
				...(Number.isFinite(sentAtMs) && {
					"queue.dwell_ms": Math.max(0, Date.now() - sentAtMs),
				}),
				...(Number.isFinite(receiveCount) && {
					"queue.receive_count": receiveCount,
				}),
			},
			fn: executeJob,
		});
	} catch (error) {
		const errorLogger = workerCtx?.logger ?? workerLogger;
		// Sync jobs: re-throw infrastructure errors so the message stays in SQS.
		// Application errors (RecaseError, InternalError) are swallowed — they
		// won't fix on retry. DB errors (connection, timeout) will.
		if (shouldRetrySqsJobError({ jobName: job.name, error })) {
			Sentry.captureException(error);
			errorLogger.error(`[${job.name}] Retryable error, keeping in SQS`, {
				jobName: job.name,
				error:
					error instanceof Error
						? { message: error.message, stack: error.stack }
						: {},
			});
			throw error;
		}

		Sentry.captureException(error);
		if (error instanceof Error) {
			errorLogger.error(`Failed to process SQS job: ${job.name}`, {
				jobName: job.name,
				error: {
					message: error.message,
					stack: error.stack,
				},
			});
		}
	} finally {
		if (workerCtx) {
			logContextExtras({ ctx: workerCtx, message: `[${job.name}] Finished` });
		}
	}
};
