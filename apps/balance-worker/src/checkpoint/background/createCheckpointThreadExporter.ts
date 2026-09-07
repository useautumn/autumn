import type { Worker } from "node:worker_threads";
import type {
	PartitionCheckpointExporter,
	PartitionCheckpointExportResult,
} from "../partitionCheckpointExporter.js";
import {
	deserializeCheckpointThreadFailure,
	PartitionCheckpointThreadError,
} from "./checkpointThreadFailure.js";
import type {
	CheckpointThreadRequest,
	CheckpointThreadResponse,
} from "./checkpointThreadProtocol.js";

type PendingExport = {
	id: number;
	cancelled: Int32Array<SharedArrayBuffer>;
	resolve(result: PartitionCheckpointExportResult): void;
	reject(cause: unknown): void;
	removeAbortListener(): void;
};

type ThreadSession = { worker: Worker; pending: PendingExport | null };

export const createCheckpointThreadExporter = ({
	createWorker,
}: {
	createWorker(): Worker;
}): PartitionCheckpointExporter & { close(): Promise<void> } => {
	let session: ThreadSession | null = null;
	let retiring: Promise<void> | null = null;
	let stopFailure: PartitionCheckpointThreadError | null = null;
	let closed = false;
	let nextId = 0;

	const retire = async ({
		target,
		cause,
	}: {
		target: ThreadSession;
		cause: unknown;
	}): Promise<void> => {
		if (session !== target) return;
		session = null;
		const pending = target.pending;
		target.pending = null;
		pending?.removeAbortListener();
		if (pending) Atomics.store(pending.cancelled, 0, 1);
		try {
			if (pending) {
				const request: CheckpointThreadRequest = {
					kind: "cancel",
					id: pending.id,
				};
				target.worker.postMessage(request);
			}
		} catch {
			// A failed thread may already have closed its message port; termination still has to finish.
		}
		try {
			await target.worker.terminate();
		} catch (error) {
			closed = true;
			stopFailure = new PartitionCheckpointThreadError({
				message: "Unable to stop checkpoint thread",
				cause: error,
			});
			target.worker.unref();
		} finally {
			pending?.reject(stopFailure ?? cause);
			retiring = null;
		}
	};

	const stopSession = ({
		target,
		cause,
	}: {
		target: ThreadSession;
		cause: unknown;
	}): void => {
		if (session !== target) return;
		retiring = retire({ target, cause });
	};

	const startSession = (): ThreadSession => {
		const target: ThreadSession = { worker: createWorker(), pending: null };
		session = target;
		target.worker.unref();
		target.worker.on("message", (response: CheckpointThreadResponse) => {
			if (session !== target || target.pending?.id !== response.id) return;
			const pending = target.pending;
			target.pending = null;
			pending.removeAbortListener();
			target.worker.unref();
			if (response.kind === "exported") pending.resolve(response.result);
			else
				pending.reject(
					deserializeCheckpointThreadFailure({ failure: response.failure }),
				);
		});
		target.worker.on("error", (cause: Error) => {
			stopSession({
				target,
				cause: new PartitionCheckpointThreadError({
					message: "Checkpoint thread failed",
					cause,
				}),
			});
		});
		target.worker.on("exit", (code: number) => {
			if (session !== target) return;
			session = null;
			target.pending?.removeAbortListener();
			target.pending?.reject(
				new PartitionCheckpointThreadError({
					message: `Checkpoint thread exited with code ${code}`,
				}),
			);
			target.pending = null;
		});
		return target;
	};

	const exportCheckpoint: PartitionCheckpointExporter["export"] = async ({
		topic,
		partition,
		signal,
		consumedNextOffset = null,
	}) => {
		signal.throwIfAborted();
		if (closed)
			throw new PartitionCheckpointThreadError({
				message: "Checkpoint exporter is closed",
			});
		if (session?.pending || retiring)
			throw new PartitionCheckpointThreadError({
				message: "Checkpoint thread is busy",
			});
		let target: ThreadSession;
		try {
			target = session ?? startSession();
		} catch (cause) {
			throw new PartitionCheckpointThreadError({
				message: "Unable to start checkpoint thread",
				cause,
			});
		}
		const id = nextId++;
		const cancelled = new Int32Array(
			new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
		);
		return new Promise<PartitionCheckpointExportResult>((resolve, reject) => {
			const abort = (): void => stopSession({ target, cause: signal.reason });
			target.pending = {
				id,
				cancelled,
				resolve,
				reject,
				removeAbortListener: () => signal.removeEventListener("abort", abort),
			};
			signal.addEventListener("abort", abort, { once: true });
			target.worker.ref();
			try {
				// This cursor predates the background read transaction; never resample it after the cut.
				const request: CheckpointThreadRequest = {
					kind: "export",
					id,
					topic,
					partition,
					consumedNextOffset,
					cancelled: cancelled.buffer,
				};
				target.worker.postMessage(request);
			} catch (cause) {
				stopSession({
					target,
					cause: new PartitionCheckpointThreadError({
						message: "Unable to send checkpoint job",
						cause,
					}),
				});
			}
		});
	};

	return {
		export: exportCheckpoint,
		close: async () => {
			closed = true;
			if (session)
				stopSession({
					target: session,
					cause: new PartitionCheckpointThreadError({
						message: "Checkpoint exporter closed",
					}),
				});
			await retiring;
			if (stopFailure) throw stopFailure;
		},
	};
};
