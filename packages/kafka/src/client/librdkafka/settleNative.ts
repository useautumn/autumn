import type { NativeKafkaError } from "./consumer/types/nativeConsumer.js";

export type NativeDone = (error: NativeKafkaError | null | undefined) => void;

/** A node-style native call as a promise: `run` is handed the completion callback. */
export function settleNative(
	run: (done: NativeDone) => unknown,
): Promise<void> {
	const settled = Promise.withResolvers<void>();
	function finish(error: NativeKafkaError | null | undefined): void {
		if (error) settled.reject(error);
		else settled.resolve();
	}
	run(finish);
	return settled.promise;
}
