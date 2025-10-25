import { type Job, type Queue, Worker } from "bullmq";
import type { Logger } from "pino";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { runActionHandlerTask } from "@/internal/analytics/runActionHandlerTask.js";
import { runSaveFeatureDisplayTask } from "@/internal/features/featureUtils.js";
import { runMigrationTask } from "@/internal/migrations/runMigrationTask.js";
import { runRewardMigrationTask } from "@/internal/migrations/runRewardMigrationTask.js";
import { detectBaseVariant } from "@/internal/products/productUtils/detectProductVariant.js";
import { runTriggerCheckoutReward } from "@/internal/rewards/triggerCheckoutReward.js";
import { runUpdateBalanceTask } from "@/trigger/updateBalanceTask.js";
import { runUpdateUsageTask } from "@/trigger/updateUsageTask.js";
import { generateId } from "@/utils/genUtils.js";
import { createWorkerAutumnContext } from "@/utils/workerUtils/createAutumnContext.js";
import { JobName } from "./JobName.js";
import { acquireLock, getRedisConnection, releaseLock } from "./lockUtils.js";
import { QueueManager } from "./QueueManager.js";

const NUM_WORKERS = 10;

const actionHandlers = [
	JobName.HandleProductsUpdated,
	JobName.HandleCustomerCreated,
];

const { db } = initDrizzle({ maxConnections: 10 });

const initWorker = ({
	id,
	queue,
	useBackup,
	db,
}: {
	id: number;
	queue: Queue;
	useBackup: boolean;
	db: DrizzleCli;
}) => {
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
					await runMigrationTask({
						db,
						payload: job.data,
						logger: workerLogger,
					});
					return;
				}

				if (actionHandlers.includes(job.name as JobName)) {
					const ctx = await createWorkerAutumnContext({
						db,
						orgId: job.data.orgId,
						env: job.data.env,
						logger: workerLogger,
						workerId: id.toString(),
					});

					await runActionHandlerTask({
						queue,
						job,
						ctx,
						useBackup,
					});
					return;
				}

				if (job.name === JobName.RewardMigration) {
					await runRewardMigrationTask({
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

			// TRIGGER CHECKOUT REWARD
			if (job.name === JobName.TriggerCheckoutReward) {
				const lockKey = `reward_trigger:${job.data.customer?.internal_id}`;
				if (
					!(await acquireLock({
						lockKey,
						timeout: 10000,
						useBackup,
					}))
				) {
					await queue.add(job.name, job.data, {
						delay: 1000,
					});
					return;
				}

				try {
					await runTriggerCheckoutReward({
						db,
						payload: job.data,
						logger: workerLogger,
					});
				} catch (error) {
					console.error("Error processing job:", error);
				} finally {
					await releaseLock({ lockKey, useBackup });
				}

				return;
			}

			// EVENT HANDLERS
			const { internalCustomerId } = job.data; // customerId is internal customer id

			while (
				!(await acquireLock({
					lockKey: `event:${internalCustomerId}`,
					timeout: 10000,
					useBackup,
				}))
			) {
				await queue.add(job.name, job.data, {
					delay: 200,
				});
				return;
			}

			try {
				if (job.name === JobName.UpdateBalance) {
					await runUpdateBalanceTask({
						payload: job.data,
						logger: workerLogger,
						db,
					});
				} else if (job.name === JobName.UpdateUsage) {
					await runUpdateUsageTask({
						payload: job.data,
						logger: workerLogger,
						db,
					});
				}
			} catch (error) {
				console.error("Error processing job:", error);
			} finally {
				await releaseLock({
					lockKey: `event:${internalCustomerId}`,
					useBackup,
				});
			}
		},
		{
			...getRedisConnection({ useBackup }),
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
		console.log(`Worker ${id} ready (${useBackup ? "BACKUP" : "MAIN"})`);
	});

	worker.on("stalled", (jobId: string) => {
		console.log(`Worker ${id} stalled (${useBackup ? "BACKUP" : "MAIN"})`);
		console.log("JOB ID:", jobId);
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

	const mainQueue = await QueueManager.getQueue({ useBackup: false });
	const backupQueue = await QueueManager.getQueue({ useBackup: true });
	await CacheManager.getInstance();

	for (let i = 0; i < NUM_WORKERS; i++) {
		workers.push(
			initWorker({
				id: i,
				queue: mainQueue,
				useBackup: false,
				db,
			}),
		);
		workers.push(
			initWorker({
				id: i,
				queue: backupQueue,
				useBackup: true,

				db,
			}),
		);
	}

	// Get stalled jobs

	return workers;
};
