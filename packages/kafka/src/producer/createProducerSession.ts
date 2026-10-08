import type {
	KafkaProducerFactory,
	KafkaRequestTiming,
	KafkaSender,
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
	ctx: {
		kafka: KafkaProducerFactory;
		/** Called for every broker request this producer makes. Must not throw. */
		onRequest?: (timing: KafkaRequestTiming) => void;
	};
	config: KafkaProducerSessionConfig;
}): KafkaProducerSession {
	const mode = config.mode ?? "transactional";
	const ctx = {
		producer: dependencies.kafka.producer(createProducerConfig(config)),
	};
	if (dependencies.onRequest)
		ctx.producer.onRequestTimings?.(guardTelemetry(dependencies.onRequest));
	const state: ProducerSessionState = {
		initialized: false,
		connected: false,
		closed: false,
		terminal: false,
		transactions: Promise.resolve(),
	};

	function isUsable(): boolean {
		return state.initialized && !state.closed && !state.terminal;
	}

	async function connectProducer(): Promise<void> {
		try {
			await ctx.producer.connect();
			state.connected = true;
		} catch (cause) {
			state.terminal = true;
			throw cause;
		}
	}

	/** A transactional producer connects in `fence()`: librdkafka bumps the epoch on connect, and only startup may fence. */
	async function connect(): Promise<void> {
		if (state.closed || state.terminal)
			throw new Error("Producer session cannot reconnect");
		if (mode === "idempotent") await connectProducer();
	}

	/** A transaction before `fence()` fences on the spot, as kafkajs did on its first transaction. */
	async function transaction(): Promise<KafkaTransaction> {
		if (mode === "idempotent")
			throw new Error("An idempotent producer session has no transactions");
		if (!state.connected && !state.closed && !state.terminal) {
			state.connecting ??= connectProducer();
			await state.connecting;
		}
		return beginProducerTransaction({ ctx, state });
	}

	function send(
		...params: Parameters<KafkaSender["send"]>
	): ReturnType<KafkaSender["send"]> {
		if (!ctx.producer.send)
			throw new Error("This producer offers no plain send");
		if (!isUsable()) throw new Error("Producer session is not usable");
		return ctx.producer.send(...params);
	}

	async function fence(): Promise<void> {
		if (state.initialized)
			throw new Error("Producer session was already initialized");
		if (mode === "idempotent") {
			// Nothing at the broker to bump: readers judge a stale owner by the epoch in its records.
			state.initialized = true;
			return;
		}
		if (state.closed || state.terminal)
			throw new Error("Producer session is unavailable");
		// Only startup initializes the epoch; cleanup must never fence a successor.
		await connectProducer();
		state.initialized = true;
	}

	async function disconnect({
		waitForTransactions = true,
	}: {
		waitForTransactions?: boolean;
	} = {}): Promise<void> {
		state.closed = true;
		if (waitForTransactions) await state.transactions;
		if (state.connected) await ctx.producer.disconnect();
	}

	return { connect, fence, transaction, send, isUsable, disconnect, mode };
}

function guardTelemetry(
	onRequest: (timing: KafkaRequestTiming) => void,
): (timing: KafkaRequestTiming) => void {
	function report(timing: KafkaRequestTiming): void {
		try {
			onRequest(timing);
		} catch {
			// Timing is telemetry; it must never fail a produce.
		}
	}
	return report;
}
