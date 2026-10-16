import type { NativeConsumer } from "./types/nativeConsumer.js";

/** Which native consumer stands behind a consumer of ours, for `sendOffsets` to read its group metadata. */
const nativeConsumers = new WeakMap<object, () => NativeConsumer | null>();

export function registerNativeConsumer({
	consumer,
	readNative,
}: {
	consumer: object;
	readNative: () => NativeConsumer | null;
}): void {
	nativeConsumers.set(consumer, readNative);
}

export function nativeConsumerOf({
	consumer,
}: {
	consumer: object;
}): NativeConsumer | null {
	return nativeConsumers.get(consumer)?.() ?? null;
}
