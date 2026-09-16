import type {
	KafkaProducerFactory,
	KafkaTransaction,
} from "../client/types/kafkaClient.js";
import { createProducerConfig } from "./producerConfig.js";
import { beginProducerTransaction } from "./producerTransactions.js";
import type {
	KafkaProducerSession,
	KafkaProducerSessionConfig,
	ProducerSessionState,
} from "./types/producer.js";

export function createProducerSession({
	ctx: dependencies,
	config,
}: {
	ctx: { kafka: KafkaProducerFactory };
	config: KafkaProducerSessionConfig;
}): KafkaProducerSession {
	const ctx = {
		producer: dependencies.kafka.producer(createProducerConfig(config)),
	};
	const state: ProducerSessionState = {
		initialized: false,
		closed: false,
		terminal: false,
		transactions: Promise.resolve(),
	};

	function isUsable(): boolean {
		return state.initialized && !state.closed && !state.terminal;
	}

	async function connect(): Promise<void> {
		if (state.closed || state.terminal)
			throw new Error("Producer session cannot reconnect");
		try {
			await ctx.producer.connect();
		} catch (cause) {
			state.terminal = true;
			throw cause;
		}
	}

	function transaction(): Promise<KafkaTransaction> {
		return beginProducerTransaction({ ctx, state });
	}

	async function fence(): Promise<void> {
		if (state.initialized)
			throw new Error("Producer session was already initialized");
		try {
			// Only startup initializes the epoch; cleanup must never fence a successor.
			const current = await transaction();
			await current.abort();
			state.initialized = true;
		} catch (cause) {
			state.terminal = true;
			throw cause;
		}
	}

	async function disconnect({
		waitForTransactions = true,
	}: {
		waitForTransactions?: boolean;
	} = {}): Promise<void> {
		state.closed = true;
		if (waitForTransactions) await state.transactions;
		await ctx.producer.disconnect();
	}

	return { connect, fence, transaction, isUsable, disconnect };
}
