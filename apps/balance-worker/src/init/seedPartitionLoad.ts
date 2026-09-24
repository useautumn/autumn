import type { AutumnLogger } from "@autumn/logging";
import type { PartitionCheckpointSource } from "../checkpoint/partitionCheckpointSource.js";
import type { PartitionLoad } from "../processor/writer/partitionLoad/createPartitionLoad.js";

const DEFAULT_CONCURRENCY = 16;
const DEFAULT_TIMEOUT_MS = 5_000;

export type PartitionLoadSeedSummary = {
	seeded: number;
	missing: number;
	failed: number;
};

/**
 * A fresh process has committed nothing, so on a cold fleet every partition
 * weighs the same and the assigner can only deal by number, which is what put
 * every large-state customer on one thread after each deploy. Checkpoint sizes
 * are durable and track the state a track has to encode, so each one stands in
 * for a single track's worth of bytes until real commits take over. Best
 * effort: a slow or missing bucket costs the seed, never the start.
 */
export async function seedPartitionLoadFromCheckpoints({
	ctx,
	config,
}: {
	ctx: {
		source: Pick<PartitionCheckpointSource, "size"> | undefined;
		partitionLoad: PartitionLoad;
		logger?: Pick<AutumnLogger, "info">;
	};
	config: {
		topic: string;
		partitionCount: number;
		concurrency?: number;
		timeoutMs?: number;
	};
}): Promise<PartitionLoadSeedSummary> {
	const summary: PartitionLoadSeedSummary = {
		seeded: 0,
		missing: 0,
		failed: 0,
	};
	const source = ctx.source;
	if (!source?.size) return summary;
	const checkpoints: Pick<PartitionCheckpointSource, "size"> = source;
	const {
		topic,
		partitionCount,
		concurrency = DEFAULT_CONCURRENCY,
		timeoutMs = DEFAULT_TIMEOUT_MS,
	} = config;
	const controller = new AbortController();
	function abandonSeed(): void {
		controller.abort();
	}
	const deadline = setTimeout(abandonSeed, timeoutMs);
	const pending: number[] = [];
	for (let partition = 0; partition < partitionCount; partition += 1) {
		pending.push(partition);
	}

	async function drain(): Promise<void> {
		while (pending.length > 0) {
			const partition = pending.shift();
			if (partition === undefined) return;
			try {
				const bytes = await checkpoints.size?.({
					topic,
					partition,
					signal: controller.signal,
				});
				if (bytes === null || bytes === undefined) summary.missing += 1;
				else {
					ctx.partitionLoad.record({ partition, bytes });
					summary.seeded += 1;
				}
			} catch {
				summary.failed += 1;
			}
		}
	}

	const drains: Promise<void>[] = [];
	for (let lane = 0; lane < Math.min(concurrency, partitionCount); lane += 1) {
		drains.push(drain());
	}
	try {
		await Promise.all(drains);
	} finally {
		clearTimeout(deadline);
	}
	ctx.logger?.info(
		{
			event: "balance_worker.partition_load_seeded",
			data: { topic, ...summary },
		},
		`Seeded partition load from ${summary.seeded} checkpoints (${summary.missing} missing, ${summary.failed} failed)`,
	);
	return summary;
}
