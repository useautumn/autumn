import { type ConnectionOptions, type Job, Worker } from "bullmq";
import type { Logger } from "pino";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { runActionHandlerTask } from "@/internal/analytics/runActionHandlerTask.js";
import { runInsertEventBatch } from "@/internal/balances/events/runInsertEventBatch.js";
import { runSyncBalanceBatch } from "@/internal/balances/utils/sync/legacy/runSyncBalanceBatch.js";
import { runSaveFeatureDisplayTask } from "@/internal/features/featureUtils.js";
import { runMigrationTask } from "@/internal/migrations/runMigrationTask.js";
import { runRewardMigrationTask } from "@/internal/migrations/runRewardMigrationTask.js";
import { detectBaseVariant } from "@/internal/products/productUtils/detectProductVariant.js";
import { runTriggerCheckoutReward } from "@/internal/rewards/triggerCheckoutReward.js";
import { generateId } from "@/utils/genUtils.js";
import { createWorkerContext } from "../createWorkerContext.js";
import { JobName } from "../JobName.js";
import { workerRedis } from "./initBullMq.js";

const NUM_WORKERS = 10;

const actionHandlers = [
	JobName.HandleProductsUpdated,
	JobName.HandleCustomerCreated,
];

const { db } = initDrizzle({ maxConnections: 10 });

const initWorker = ({ id, db }: { id: number; db: DrizzleCli }) => {
	const worker = new Worker(
		"autumn",
		async (job: Job) => {
			const workerLogger = logger.child({
				context: {
					worker: {
						task: job.name,
						data: job.data,
						jobId: generateId("job"),
						workerId: id,
					},
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
					await runSaveFeatureDisplayTask({
						db,
						feature: job.data.feature,
						logger: workerLogger,
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

				if (job.name === JobName.SyncBalanceBatch) {
					await runSyncBalanceBatch({
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
					await runTriggerCheckoutReward({
						db,
						payload: job.data,
						logger: workerLogger,
					});
				}
			} catch (error: any) {
				workerLogger.error(`Failed to process bullmq job: ${job.name}`, {
					jobName: job.name,
					error: {
						message: error.message,
						stack: error.stack,
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
		console.log(`Worker ${id} ready`);
	});

	worker.on("stalled", (jobId: string) => {
		console.log(`Worker ${id} stalled (jobId: ${jobId})`);
	});

	worker.on("error", async (error: any) => {
		if (error.code !== "ECONNREFUSED") {
			console.log("WORKER ERROR:", error.message);
		}
	});

	worker.on("failed", (_, error) => {
		console.log("WORKER FAILED:", error.message);
	});
};

export const initWorkers = async () => {
	const workers = [];

	for (let i = 0; i < NUM_WORKERS; i++) {
		workers.push(
			initWorker({
				id: i,
				db,
			}),
		);
	}

	return workers;
};
