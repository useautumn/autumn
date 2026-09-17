import {
	type KafkaProducerLimits,
	type KafkaProducerSession,
	type KafkaProducerSessionConfig,
	type KafkaTransaction,
	partitionProducerTransactionalIdOf,
} from "@autumn/kafka";
import { translateKafkaProducerError } from "./workerKafkaErrors.js";

export function createWorkerProducerConfig({
	deploymentEnvironment,
	topic,
	partition,
	limits,
}: {
	deploymentEnvironment: string;
	topic: string;
	partition: number;
	limits: KafkaProducerLimits;
}): KafkaProducerSessionConfig {
	return {
		transactionalId: partitionProducerTransactionalIdOf({
			prefix: "autumn-balance-worker",
			deploymentEnvironment,
			topic,
			partition,
		}),
		limits,
	};
}

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
