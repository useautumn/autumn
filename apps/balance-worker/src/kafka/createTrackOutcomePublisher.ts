import type { TrackOutcome } from "@autumn/balance-engine";
import {
	createMeteringPublisher,
	KafkaBatchNotCommittedError,
	type KafkaProducer,
} from "@autumn/kafka";
import {
	type CommittedTrackOutcomeAppender,
	TrackOutcomeBatchNotCommittedError,
} from "../writer/committedTrackOutcomeAppender.js";

export function createTrackOutcomePublisher({
	ctx,
}: {
	ctx: { producer: KafkaProducer };
}): CommittedTrackOutcomeAppender {
	const publisher = createMeteringPublisher({ ctx });

	async function appendCommitted({
		topic,
		partition,
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly TrackOutcome[];
	}): Promise<{ baseOffset: bigint }> {
		try {
			return await publisher.append({ topic, partition, records: outcomes });
		} catch (cause) {
			if (cause instanceof KafkaBatchNotCommittedError) {
				throw new TrackOutcomeBatchNotCommittedError({ cause: cause.cause });
			}
			throw cause;
		}
	}

	return { appendCommitted };
}
