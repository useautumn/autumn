import type { PartitionCheckpointV1 } from "../../checkpoint/partitionCheckpoint.js";
import { createPartitionCheckpointScheduler } from "../../checkpoint/scheduling/partitionCheckpointScheduler.js";
import type { PartitionCheckpointSchedulerClock } from "../../checkpoint/scheduling/partitionCheckpointSchedulerConfig.js";
import { assertPartitionCheckpointSchedulerConfig } from "../../checkpoint/scheduling/partitionCheckpointSchedulerConfig.js";
import { createS3CheckpointThreadExporter } from "../../s3/background/createS3CheckpointThreadExporter.js";
import { createS3CheckpointSourceResource } from "../../s3/createS3CheckpointSourceResource.js";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import type {
	WorkerCheckpointFactories,
	WorkerCheckpointResources,
} from "../types/workerCheckpointResources.js";
import type { WorkerCheckpointConfig } from "../workerCheckpointConfig.js";

export async function createWorkerCheckpointResources({
	ctx,
	config,
}: {
	ctx: {
		stateStore: SqliteBalanceStateStore;
		clock?: PartitionCheckpointSchedulerClock;
		factories?: WorkerCheckpointFactories;
	};
	config: WorkerCheckpointConfig;
}): Promise<WorkerCheckpointResources> {
	assertPartitionCheckpointSchedulerConfig({ config: config.scheduler });
	const factories = ctx.factories ?? {
		createSource: createS3CheckpointSourceResource,
		createExporter: createS3CheckpointThreadExporter,
	};
	let storage:
		| ReturnType<WorkerCheckpointFactories["createSource"]>
		| undefined;
	let exporter:
		| ReturnType<WorkerCheckpointFactories["createExporter"]>
		| undefined;
	try {
		if (config.mode !== "off") storage = factories.createSource(config.s3);
		if (config.mode === "enabled")
			exporter = factories.createExporter(config.s3);
		const maintenance = createPartitionCheckpointScheduler({
			stateStore: ctx.stateStore,
			exporter,
			clock: ctx.clock,
			config: config.scheduler,
		});
		let stopping: Promise<void> | undefined;
		function stop(): Promise<void> {
			stopping ??= finishStop();
			return stopping;
		}
		async function finishStop(): Promise<void> {
			const results = await Promise.allSettled([
				maintenance.stop(),
				exporter?.close(),
			]);
			storage?.close();
			const errors: unknown[] = [];
			for (const result of results)
				if (result.status === "rejected") errors.push(result.reason);
			if (errors.length > 0)
				throw new AggregateError(
					errors,
					"Checkpoint resources did not settle safely",
				);
		}
		return { source: storage?.source ?? { latest }, maintenance, stop };
	} catch (cause) {
		try {
			await exporter?.close();
		} finally {
			storage?.close();
		}
		throw cause;
	}
}

async function latest(): Promise<PartitionCheckpointV1 | null> {
	return null;
}
