import { readPartitionRange } from "./readPartitionRange.js";
import type {
	ActivePartitionRead,
	PartitionLogRecord,
	PartitionReader,
	PartitionReaderConfig,
	PartitionReaderKafka,
	PartitionReadRange,
	PartitionReadState,
} from "./types/reader.js";

export function createPartitionReader({
	ctx,
	config,
}: {
	ctx: { kafka: PartitionReaderKafka };
	config: PartitionReaderConfig;
}): PartitionReader {
	const reads = new Map<AbortController, ActivePartitionRead>();
	let closed = false;

	async function readAndRelease({
		controller,
		range,
		state,
	}: {
		controller: AbortController;
		range: PartitionReadRange;
		state: PartitionReadState;
	}): Promise<readonly PartitionLogRecord[]> {
		try {
			return await readPartitionRange({ ctx, config, range, state });
		} finally {
			if (state.cleanupFailure === undefined) reads.delete(controller);
		}
	}

	function readRange(
		params: PartitionReadRange,
	): Promise<readonly PartitionLogRecord[]> {
		if (closed) throw new Error("Partition reader is disconnected");
		const controller = new AbortController();
		const signal = params.signal
			? AbortSignal.any([params.signal, controller.signal])
			: controller.signal;
		const state: PartitionReadState = {};
		const reading = readAndRelease({
			controller,
			range: { ...params, signal },
			state,
		});
		reads.set(controller, { reading, state });
		return reading;
	}

	async function disconnect(): Promise<void> {
		closed = true;
		const activeReads = [...reads.values()];
		const pendingReads = [];
		for (const { reading } of activeReads) pendingReads.push(reading);
		for (const controller of reads.keys()) controller.abort();
		await Promise.allSettled(pendingReads);
		const failures = [];
		for (const { state } of activeReads) {
			if (state.cleanupFailure !== undefined)
				failures.push(state.cleanupFailure);
		}
		if (failures.length === 1) throw failures[0];
		if (failures.length > 1)
			throw new AggregateError(failures, "Partition reader cleanup failed");
	}

	return { readRange, disconnect };
}
