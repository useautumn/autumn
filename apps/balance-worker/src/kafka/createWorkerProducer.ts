import {
	type KafkaProducerSession,
	type KafkaTransaction,
	sendOwnerFence,
} from "@autumn/kafka";

export { createWorkerProducerConfig } from "../init/workerConfig.js";

import { translateKafkaProducerError } from "./workerKafkaErrors.js";

export type WorkerProducer = KafkaProducerSession & {
	/** Idempotent mode with a known epoch: writes the fence marker and returns where it landed; otherwise null. */
	fenceOwnership(): Promise<{ offset: bigint } | null>;
};

export function createWorkerProducer({
	ctx,
	config,
}: {
	ctx: {
		session: KafkaProducerSession;
		/** The epoch the partition's writer holds; undefined until a claim names it. */
		ownerEpoch?: () => string | undefined;
	};
	config: { topic: string; partition: number };
}): WorkerProducer {
	const { session } = ctx;
	const { topic, partition } = config;
	const { isUsable } = session;

	function disconnect({
		waitForTransactions = false,
	}: {
		waitForTransactions?: boolean;
	} = {}): Promise<void> {
		// Runtime owns the drain deadline; disposal must not wait again for an uncertain transaction.
		return session.disconnect({ waitForTransactions });
	}

	async function connect(): Promise<void> {
		try {
			await session.connect();
		} catch (cause) {
			throw translateKafkaProducerError({ topic, partition, cause });
		}
	}

	async function fence(): Promise<void> {
		try {
			await session.fence();
		} catch (cause) {
			throw translateKafkaProducerError({ topic, partition, cause });
		}
		// A handoff names the epoch before activation: the marker goes in here and the catch-up covers it.
		await fenceOwnership();
	}
	async function fenceOwnership(): Promise<{ offset: bigint } | null> {
		if (session.mode !== "idempotent") return null;
		const ownerEpoch = ctx.ownerEpoch?.();
		if (ownerEpoch === undefined) return null;
		try {
			return await sendOwnerFence({
				sender: session,
				topic,
				partition,
				ownerEpoch,
			});
		} catch (cause) {
			throw translateKafkaProducerError({ topic, partition, cause });
		}
	}

	async function transaction(): Promise<KafkaTransaction> {
		try {
			return await session.transaction();
		} catch (cause) {
			throw translateKafkaProducerError({ topic, partition, cause });
		}
	}

	async function send(
		...params: Parameters<KafkaProducerSession["send"]>
	): ReturnType<KafkaProducerSession["send"]> {
		try {
			return await session.send(...params);
		} catch (cause) {
			throw translateKafkaProducerError({ topic, partition, cause });
		}
	}

	return {
		connect,
		fence,
		fenceOwnership,
		disconnect,
		transaction,
		send,
		isUsable,
		mode: session.mode,
	};
}
