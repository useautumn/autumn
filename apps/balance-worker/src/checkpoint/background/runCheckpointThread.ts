import type { MessagePort } from "node:worker_threads";
import {
	createPartitionCheckpointExporter,
	type PartitionCheckpointCapture,
} from "../partitionCheckpointExporter.js";
import type { PartitionCheckpointLimits } from "../partitionCheckpointLimits.js";
import type { PartitionCheckpointPublisher } from "../partitionCheckpointPublisher.js";
import { serializeCheckpointThreadFailure } from "./checkpointThreadFailure.js";
import type {
	CheckpointThreadRequest,
	CheckpointThreadResponse,
} from "./checkpointThreadProtocol.js";

export const runCheckpointThread = ({
	port,
	stateStore,
	publisher,
	limits,
}: {
	port: MessagePort;
	stateStore: PartitionCheckpointCapture;
	publisher: PartitionCheckpointPublisher;
	limits: PartitionCheckpointLimits;
}): void => {
	let active: { id: number; controller: AbortController } | null = null;
	const receive = async (request: CheckpointThreadRequest): Promise<void> => {
		if (request.kind === "cancel") {
			if (active?.id === request.id) active.controller.abort();
			return;
		}
		const controller = new AbortController();
		const cancelled = new Int32Array(request.cancelled);
		const assertCurrent = (): void => {
			if (Atomics.load(cancelled, 0) !== 0) controller.abort();
			controller.signal.throwIfAborted();
		};
		try {
			if (active)
				throw new Error("Checkpoint thread received overlapping jobs");
			active = { id: request.id, controller };
			assertCurrent();
			const exporter = createPartitionCheckpointExporter({
				stateStore,
				limits,
				clock: { now: Date.now },
				publisher: {
					publish: async (params) => {
						assertCurrent();
						return publisher.publish(params);
					},
				},
			});
			const result = await exporter.export({
				topic: request.topic,
				partition: request.partition,
				consumedNextOffset: request.consumedNextOffset,
				signal: controller.signal,
			});
			assertCurrent();
			const response: CheckpointThreadResponse = {
				kind: "exported",
				id: request.id,
				result,
			};
			port.postMessage(response);
		} catch (cause) {
			const response: CheckpointThreadResponse = {
				kind: "failed",
				id: request.id,
				failure: serializeCheckpointThreadFailure({ cause }),
			};
			port.postMessage(response);
		} finally {
			if (active?.id === request.id) active = null;
		}
	};
	port.on("message", receive);
};
