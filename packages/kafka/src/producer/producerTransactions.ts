import type { ProducerRecord, RecordMetadata } from "kafkajs";
import type {
	KafkaProducerClient,
	KafkaTransaction,
} from "../client/types/kafkaClient.js";
import { isKafkaProducerFencingCause } from "./producerErrors.js";
import type { ProducerSessionState } from "./types/producer.js";

export async function beginProducerTransaction({
	ctx,
	state,
}: {
	ctx: { producer: KafkaProducerClient };
	state: ProducerSessionState;
}): Promise<KafkaTransaction> {
	const preceding = state.transactions;
	const settlement = Promise.withResolvers<void>();
	state.transactions = settlement.promise;
	await preceding;

	let current: KafkaTransaction;
	try {
		if (state.closed || state.terminal)
			throw new Error("Producer session is unavailable");
		current = await ctx.producer.transaction();
	} catch (cause) {
		state.terminal = true;
		settlement.resolve();
		throw cause;
	}

	async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
		try {
			return await current.send(record);
		} catch (cause) {
			if (isKafkaProducerFencingCause({ cause })) state.terminal = true;
			throw cause;
		}
	}

	async function finish({
		action,
	}: {
		action: "commit" | "abort";
	}): Promise<void> {
		try {
			await current[action]();
		} catch (cause) {
			state.terminal = true;
			throw cause;
		} finally {
			settlement.resolve();
		}
	}

	function commit(): Promise<void> {
		return finish({ action: "commit" });
	}

	function abort(): Promise<void> {
		return finish({ action: "abort" });
	}

	return { send, commit, abort };
}
