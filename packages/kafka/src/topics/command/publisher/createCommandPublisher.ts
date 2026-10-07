import { CompressionTypes } from "kafkajs";
import { serializeCommandRecord } from "../commandTopic.js";
import type {
	CommandAppend,
	CommandPublisher,
	CommandPublisherContext,
} from "./types/commandPublisher.js";

/** Most commands are ~0.6 KB, so a full send of them stays well inside the broker's 1 MB message limit. */
const MAX_RECORDS_PER_SEND = 500;
/** A track's properties are the caller's, so bytes bound a send too: gzip saves only about a quarter on commands. */
const MAX_BYTES_PER_SEND = 800_000;

type CommandMessage = { key: Buffer; value: Buffer; partition: number };

type WaitingAppend = {
	messages: CommandMessage[];
	bytes: number;
	resolve: () => void;
	reject: (cause: unknown) => void;
};

/** The idempotent producer has one request in flight per broker, so appends that arrive during a send
 *  go out together in the next one instead of queueing one request each behind it. */
export function createCommandPublisher({
	ctx,
}: {
	ctx: CommandPublisherContext;
}): CommandPublisher {
	const waiting: WaitingAppend[] = [];
	let sending = false;

	function takeNextSend(): WaitingAppend[] {
		const batch: WaitingAppend[] = [];
		let records = 0;
		let bytes = 0;
		for (let next = waiting[0]; next; next = waiting[0]) {
			const full =
				records + next.messages.length > MAX_RECORDS_PER_SEND ||
				bytes + next.bytes > MAX_BYTES_PER_SEND;
			if (batch.length > 0 && full) break;
			batch.push(next);
			records += next.messages.length;
			bytes += next.bytes;
			waiting.shift();
		}
		return batch;
	}

	async function sendBatch(batch: WaitingAppend[]): Promise<void> {
		const messages: CommandMessage[] = [];
		for (const append of batch) messages.push(...append.messages);
		try {
			// acks -1 is what an idempotent producer requires; every message is acknowledged or the send throws.
			await ctx.producer.send({
				topic: ctx.topic,
				messages,
				acks: -1,
				compression: CompressionTypes.GZIP,
			});
		} catch (cause) {
			for (const append of batch) append.reject(cause);
			return;
		}
		for (const append of batch) append.resolve();
	}

	async function drain(): Promise<void> {
		sending = true;
		try {
			for (let batch = takeNextSend(); batch.length > 0; ) {
				await sendBatch(batch);
				batch = takeNextSend();
			}
		} finally {
			sending = false;
		}
	}

	function append(params: CommandAppend): Promise<void> {
		if (params.records.length === 0)
			return Promise.reject(
				new RangeError("Command record batch cannot be empty"),
			);
		const messages: CommandMessage[] = [];
		let bytes = 0;
		for (const { partition, command } of params.records) {
			const message = {
				...serializeCommandRecord({ record: command }),
				partition,
			};
			messages.push(message);
			bytes += message.key.length + message.value.length;
		}
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		waiting.push({ messages, bytes, resolve, reject });
		if (!sending) void drain();
		return promise;
	}

	return { append };
}
