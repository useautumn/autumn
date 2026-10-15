import type {
	TopicRecord,
	TopicRecordHandler,
	TopicRecordResult,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import { z } from "zod/v4";
import type { PartitionRuntimePort } from "../../partitions/types/partitions.js";
import type { MigrationLaneItem } from "../../processor/commands/applyMigrationBatch/types/migrationLaneItem.js";

const MAX_ITEMS_PER_APPLY = 500;
const RECORDS_PER_TURN = 50;

const yieldToEventLoop = (): Promise<void> =>
	new Promise((resolve) => setImmediate(resolve));
const RUNTIME_WAIT_MS = 10_000;
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
	const buffered = new Map<
		number,
		{ messages: TopicRecord["message"][]; lastOffset: bigint }
	>();

	function readResumeOffset(): null {
		return null;
	}

	function applyRecord({ partition, message }: TopicRecord): TopicRecordResult {
		if (!message.value) return;
		const offset = BigInt(message.offset);
		const held = buffered.get(partition);
		const messages = held && held.lastOffset < offset ? held.messages : [];
		messages.push(message);
		buffered.set(partition, { messages, lastOffset: offset });
	}

	async function parseChunk({
		topic,
		partition,
		messages,
	}: {
		topic: string;
		partition: number;
		messages: TopicRecord["message"][];
	}): Promise<MigrationLaneItem[]> {
		const items: MigrationLaneItem[] = [];
		for (const [index, message] of messages.entries()) {
			if (index > 0 && index % RECORDS_PER_TURN === 0) await yieldToEventLoop();
			try {
				items.push(
					migrationLaneRecordSchema.parse(
						JSON.parse(message.value?.toString("utf8") ?? "null"),
					) as MigrationLaneItem,
				);
			} catch (cause) {
				ctx.logger?.warn("Migration record skipped: unreadable", {
					topic,
					partition,
					offset: message.offset,
					error: cause,
				});
			}
		}
		return items;
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
		heartbeat,
	}: {
		topic: string;
		partition: number;
		heartbeat?: () => Promise<void>;
	}): Promise<void> {
		const messages = buffered.get(partition)?.messages ?? [];
		buffered.delete(partition);
		for (let start = 0; start < messages.length; start += MAX_ITEMS_PER_APPLY) {
			const chunk = await parseChunk({
				topic,
				partition,
				messages: messages.slice(start, start + MAX_ITEMS_PER_APPLY),
			});
			await heartbeat?.();
			const runtime = await ownedRuntimeOf({ partition });
			const outcome = await runtime
				.process((processor) => {
					if (!processor.applyMigrationBatch)
						throw new Error("Processor cannot apply migration batches");
					return processor.applyMigrationBatch({ items: chunk });
				})
				.catch((cause: unknown) => {
					ctx.logger?.warn("Migration batch failed", {
						event: "balance_worker.migration_batch_failed",
						topic,
						partition,
						size: chunk.length,
						reason: cause instanceof Error ? cause.message : String(cause),
					});
					throw cause;
				});
			ctx.logger?.info("Migration batch applied", {
				event: "balance_worker.migration_batch",
				topic,
				partition,
				appliedAt: Date.now(),
				...outcome,
			});
			await heartbeat?.();
		}
	}

	function resolvesOnSettle(): boolean {
		return true;
	}

	return { readResumeOffset, applyRecord, settleBatch, resolvesOnSettle };
}
