import type {
	TopicRecord,
	TopicRecordHandler,
	TopicRecordResult,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import { z } from "zod/v4";
import type { PartitionRuntimePort } from "../../partitions/types/partitions.js";
import type { MigrationLaneItem } from "../../processor/commands/applyMigrationBatch/types/migrationLaneItem.js";

const MAX_ITEMS_PER_APPLY = 2_000;
const RUNTIME_WAIT_MS = 30_000;
const RUNTIME_POLL_MS = 100;

const migrationLaneRecordSchema = z
	.object({
		request: z.record(z.string(), z.unknown()),
		migrationInternalId: z.string(),
		migrationRunId: z.string(),
		internalCustomerId: z.string(),
		producedAt: z.number(),
		forceColdRollback: z.boolean().optional(),
	})
	.loose();

export type MigrationConsumerContext = {
	findOwnedRuntime(position: {
		partition: number;
	}): PartitionRuntimePort | undefined;
	logger?: Pick<AutumnLogger, "info" | "warn">;
};

/** A partition's records are gathered as the batch arrives and applied once it ends: the batch is the unit the worker fences. */
export function createMigrationRecordHandler({
	ctx,
}: {
	ctx: MigrationConsumerContext;
}): TopicRecordHandler {
	const buffered = new Map<number, MigrationLaneItem[]>();

	function readResumeOffset(): null {
		return null;
	}

	function applyRecord({
		topic,
		partition,
		message,
	}: TopicRecord): TopicRecordResult {
		if (!message.value) return;
		let item: MigrationLaneItem;
		try {
			item = migrationLaneRecordSchema.parse(
				JSON.parse(message.value.toString("utf8")),
			) as MigrationLaneItem;
		} catch (cause) {
			ctx.logger?.warn("Migration record skipped: unreadable", {
				topic,
				partition,
				offset: message.offset,
				error: cause,
			});
			return;
		}
		const items = buffered.get(partition) ?? [];
		items.push(item);
		buffered.set(partition, items);
	}

	async function ownedRuntimeOf({
		partition,
	}: {
		partition: number;
	}): Promise<PartitionRuntimePort> {
		const giveUpAt = Date.now() + RUNTIME_WAIT_MS;
		for (;;) {
			const runtime = ctx.findOwnedRuntime({ partition });
			if (runtime) return runtime;
			if (Date.now() > giveUpAt)
				throw new Error(
					`No owned runtime for migration partition ${partition}`,
				);
			await Bun.sleep(RUNTIME_POLL_MS);
		}
	}

	async function settleBatch({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): Promise<void> {
		const items = buffered.get(partition) ?? [];
		buffered.delete(partition);
		for (let start = 0; start < items.length; start += MAX_ITEMS_PER_APPLY) {
			const chunk = items.slice(start, start + MAX_ITEMS_PER_APPLY);
			const runtime = await ownedRuntimeOf({ partition });
			const outcome = await runtime.process((processor) => {
				if (!processor.applyMigrationBatch)
					throw new Error("Processor cannot apply migration batches");
				return processor.applyMigrationBatch({ items: chunk });
			});
			ctx.logger?.info("Migration batch applied", {
				event: "balance_worker.migration_batch",
				topic,
				partition,
				appliedAt: Date.now(),
				...outcome,
			});
		}
	}

	return { readResumeOffset, applyRecord, settleBatch };
}
