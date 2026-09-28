import type { PartitionCheckpointV1 } from "../../../checkpoint/partitionCheckpoint.js";
import { PartitionCheckpointSourceError } from "../../../checkpoint/partitionCheckpointSource.js";
import type {
	PartitionBootstrapContext,
	PartitionBootstrapSleep,
} from "../types/partitionBootstrap.js";

export async function loadPartitionCheckpoint({
	ctx,
	topic,
	partition,
	signal,
}: {
	ctx: PartitionBootstrapContext;
	topic: string;
	partition: number;
	signal: AbortSignal;
}): Promise<PartitionCheckpointV1 | null> {
	const { checkpointSource, retryPolicy, sleep } = ctx;
	let delayMs = retryPolicy.initialBackoffMs;
	for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
		signal.throwIfAborted();
		try {
			const checkpoint = await checkpointSource.latest({
				topic,
				partition,
				signal,
			});
			signal.throwIfAborted();
			return checkpoint;
		} catch (cause) {
			signal.throwIfAborted();
			const shouldRetry =
				cause instanceof PartitionCheckpointSourceError &&
				cause.retriable &&
				attempt < retryPolicy.maxAttempts;
			if (!shouldRetry) throw cause;
			await sleep({ delayMs, signal });
			delayMs = Math.min(delayMs * 2, retryPolicy.maxBackoffMs);
		}
	}
	throw new Error("Checkpoint source retry loop ended unexpectedly");
}

export function sleepWithSignal({
	delayMs,
	signal,
}: PartitionBootstrapSleep): Promise<void> {
	function waitUntilReady(
		resolve: () => void,
		reject: (cause: unknown) => void,
	): void {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}
		function complete(): void {
			signal.removeEventListener("abort", abort);
			resolve();
		}
		function abort(): void {
			clearTimeout(timeout);
			reject(signal.reason);
		}
		const timeout = setTimeout(complete, delayMs);
		signal.addEventListener("abort", abort, { once: true });
	}
	return new Promise<void>(waitUntilReady);
}
