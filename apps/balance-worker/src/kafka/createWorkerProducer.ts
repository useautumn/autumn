import type { KafkaProducerSession, KafkaTransaction } from "@autumn/kafka";

export { createWorkerProducerConfig } from "../init/workerConfig.js";

import { translateKafkaProducerError } from "./workerKafkaErrors.js";

export function createWorkerProducer({
	ctx,
	config,
}: {
	ctx: { session: KafkaProducerSession };
	config: { topic: string; partition: number };
}): KafkaProducerSession {
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
	}

	async function transaction(): Promise<KafkaTransaction> {
		try {
			return await session.transaction();
		} catch (cause) {
			throw translateKafkaProducerError({ topic, partition, cause });
		}
	}

	return { connect, fence, disconnect, transaction, isUsable };
}
