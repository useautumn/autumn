import type {
	ConsumerConfig,
	ConsumerEventByName,
	ConsumerEventName,
	ConsumerRunConfig,
} from "../../../types/kafkaWire.js";
import type { NativeConsumer, NativeMessage } from "./nativeConsumer.js";

export type ConsumerListeners = {
	[Name in ConsumerEventName]: Set<(event: ConsumerEventByName[Name]) => void>;
};

export type ConsumerRunnerState = {
	native: NativeConsumer | null;
	topics: string[];
	fromBeginning: boolean;
	run: ConsumerRunConfig | null;
	/** True from `run` until `stop`, a crash that does not restart, or `disconnect`. */
	running: boolean;
	/** Set while leaving the group: group changes are no longer the caller's business. */
	leaving: boolean;
	loop: Promise<void> | null;
	/** "topic\0partition" → partition, for everything currently assigned. */
	assigned: Map<string, { topic: string; partition: number }>;
	/** Bumped on revoke and on crash: a batch from an older generation is stale and its heartbeat throws. */
	generation: Map<string, number>;
	/** Bumped on every seek: records fetched before it are dropped. */
	seekEpoch: Map<string, number>;
	paused: Set<string>;
	/** The first offset a paused partition had fetched and not delivered; resume seeks back to it. */
	skippedFrom: Map<string, number>;
	/** Seeks and pauses asked for while a partition is being assigned, applied with the assignment. */
	pendingSeeks: Map<string, number>;
	/** Partitions the caller is hearing about before librdkafka has them: their seeks wait for the assign. */
	assigning: Set<string>;
	/** Next offset to commit, per partition, as resolved by the handler. */
	resolved: Map<string, string>;
	committed: Map<string, string>;
	/** A failure the loop acts on after the batches in flight: rewind and rejoin, or end when terminal. */
	restartPending: { cause: Error; terminal: boolean } | null;
	/** Where the native consumer's records and partition ends go during one `consume()`. */
	collector: {
		onData(message: NativeMessage): void;
		onEof(eof: { topic: string; partition: number; offset: number }): void;
	} | null;
	listeners: ConsumerListeners;
};

export type ConsumerRunnerScope = {
	config: ConsumerConfig;
	state: ConsumerRunnerState;
	log: (level: "warn" | "error", message: string, fields?: object) => void;
};

export function partitionKeyOf({
	topic,
	partition,
}: {
	topic: string;
	partition: number;
}): string {
	return `${topic}\u0000${partition}`;
}
