import {
	createMeteringPublisher,
	KafkaBatchNotCommittedError,
	type KafkaProducer,
	type MeteringRecord,
} from "@autumn/kafka";
import type { CommittedOutcomeAppender } from "../processor/writer/types/partitionWriter.js";
import { MutationBatchNotCommittedError } from "../processor/writer/writerErrors.js";
import { translateKafkaProducerError } from "./workerKafkaErrors.js";

export function createMutationPublisher({
	ctx,
}: {
	ctx: { producer: KafkaProducer };
}): CommittedOutcomeAppender {
	const publisher = createMeteringPublisher({ ctx });

	async function appendCommitted({
		topic,
		partition,
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
	}): Promise<{ baseOffset: bigint }> {
		try {
			return await publisher.append({ topic, partition, records: outcomes });
		} catch (cause) {
			const translated = translateKafkaProducerError({
				topic,
				partition,
				cause,
			});
			if (translated !== cause) throw translated;
			if (cause instanceof KafkaBatchNotCommittedError) {
				throw new MutationBatchNotCommittedError({ cause: cause.cause });
			}
			throw cause;
		}
	}

	return { appendCommitted };
}
