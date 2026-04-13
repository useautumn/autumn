import { type ConnectionOptions, type Job, Worker } from "bullmq";
import type { Logger } from "pino";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { runActionHandlerTask } from "@/internal/analytics/runActionHandlerTask.js";
import { autoTopup } from "@/internal/balances/autoTopUp/autoTopup.js";
import { runInsertEventBatch } from "@/internal/balances/events/runInsertEventBatch.js";
import { syncItemV3 } from "@/internal/balances/utils/sync/syncItemV3.js";
import { generateFeatureDisplay } from "@/internal/features/workflows/generateFeatureDisplay.js";
import { runMigrationTask } from "@/internal/migrations/runMigrationTask.js";
import { runRewardMigrationTask } from "@/internal/migrations/runRewardMigrationTask.js";
import { detectBaseVariant } from "@/internal/products/productUtils/detectProductVariant.js";
import { runTriggerCheckoutReward } from "@/internal/rewards/triggerCheckoutReward.js";
import { addWorkflowToLogs } from "@/utils/logging/addContextToLogs.js";
import { createWorkerContext } from "../createWorkerContext.js";
import { JobName } from "../JobName.js";
import { workerRedis } from "./initBullMq.js";

const NUM_WORKERS = 10;
const shouldLogBullMqWorkerReady = false;

const actionHandlers = [
	JobName.HandleProductsUpdated,
	JobName.HandleCustomerCreated,
];

const { db } = initDrizzle({ maxConnections: 10 });

const initWorker = ({ id, db }: { id: number; db: DrizzleCli }) => {
	const worker = new Worker(
		"autumn",
		async (job: Job) => {
			const workerLogger = addWorkflowToLogs({
				logger,
				workflowContext: {
					id: id.toString(),
					name: job.name,
					payload: job.data,
				},
			});

			const ctx = await createWorkerContext({
				db,
				logger: workerLogger,
				payload: job.data,
			});

			try {
				if (job.name === JobName.DetectBaseVariant) {
					await detectBaseVariant({
						db,
						curProduct: job.data.curProduct,
						logger: workerLogger as Logger,
					});
					return;
				}

				if (job.name === JobName.GenerateFeatureDisplay) {
					if (!ctx) {
						workerLogger.error(
							"No context found for generate feature display job",
						);
						return;
					}

					await generateFeatureDisplay({
						ctx,
						payload: job.data,
					});
					return;
				}

				if (job.name === JobName.Migration) {
					if (!ctx) {
						workerLogger.error("No context found for migration job");
						return;
					}
					await runMigrationTask({
						ctx,
						payload: job.data,
					});
					return;
				}

				if (actionHandlers.includes(job.name as JobName)) {
					await runActionHandlerTask({
						jobName: job.name as JobName,
						payload: job.data,
						ctx,
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
						workerLogger.error(
							"No context found for sync balance batch v3 job",
						);
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
						workerLogger.error(
							"No context found for trigger checkout reward job",
						);
						return;
					}
					await runTriggerCheckoutReward({
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
			} catch (error: unknown) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				const errorStack = error instanceof Error ? error.stack : undefined;
				workerLogger.error(`Failed to process bullmq job: ${job.name}`, {
					jobName: job.name,
					error: {
						message: errorMessage,
						stack: errorStack,
					},
				});
			}
		},
		{
			connection: workerRedis as ConnectionOptions,
			concurrency: 1,
			removeOnComplete: {
				count: 0,
			},
			removeOnFail: {
				count: 0,
			},
			drainDelay: 1000,
			maxStalledCount: 0,
		},
	);

	worker.on("ready", () => {
		if (!shouldLogBullMqWorkerReady) return;
		console.log(`Worker ${id} ready`);
	});

	worker.on("stalled", (jobId: string) => {
		console.log(`Worker ${id} stalled (jobId: ${jobId})`);
	});

	worker.on("error", async (error: unknown) => {
		const errorCode =
			error && typeof error === "object" && "code" in error
				? error.code
				: undefined;
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		if (errorCode !== "ECONNREFUSED") {
			console.log("WORKER ERROR:", errorMessage);
		}
	});

	worker.on("failed", (_, error) => {
		console.log("WORKER FAILED:", error.message);
	});
};

export const initWorkers = async ({
	startupStartedAt,
	queueImplementation,
}: {
	startupStartedAt: number;
	queueImplementation: string;
}) => {
	const { warmupRegionalRedis } = await import("@/external/redis/initRedis.js");
	await warmupRegionalRedis();

	const workers = [];

	for (let i = 0; i < NUM_WORKERS; i++) {
		workers.push(
			initWorker({
				id: i,
				db,
			}),
		);
	}

	const startupDurationMs = Date.now() - startupStartedAt;
	console.log(
		`[Worker ${process.pid}] ${queueImplementation} worker ready in ${startupDurationMs}ms`,
	);

	return workers;
};
