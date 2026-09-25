import type { RequestEvent } from "kafkajs";
import type {
	KafkaProducerClient,
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
		observeRequests({
			producer: ctx.producer,
			onRequest: dependencies.onRequest,
		});
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
		if (mode === "idempotent")
			throw new Error("An idempotent producer session has no transactions");
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

	return { connect, fence, transaction, send, isUsable, disconnect, mode };
}

function observeRequests({
	producer,
	onRequest,
}: {
	producer: KafkaProducerClient;
	onRequest: (timing: KafkaRequestTiming) => void;
}): void {
	if (!producer.on || !producer.events) return;
	function report({ payload }: RequestEvent): void {
		try {
			onRequest({
				apiName: payload.apiName,
				broker: payload.broker,
				durationMs: payload.duration,
				pendingMs: payload.pendingDuration,
			});
		} catch {
			// Timing is telemetry; it must never fail a produce.
		}
	}
	producer.on(producer.events.REQUEST, report);
}
