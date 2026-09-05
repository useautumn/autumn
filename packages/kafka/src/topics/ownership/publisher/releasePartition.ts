import { sendTransactionalBatch } from "../../../producer/sendTransactionalBatch.js";
import { ownershipTopic } from "../ownershipTopic.js";
import type {
	OwnershipPublication,
	OwnershipPublisherContext,
	OwnershipRelease,
} from "./types/ownershipPublisher.js";

export async function releasePartition({
	ctx,
	topic,
	partition,
	releasedAt,
}: OwnershipRelease & {
	ctx: OwnershipPublisherContext;
	topic: string;
}): Promise<OwnershipPublication> {
	const { baseOffset } = await sendTransactionalBatch({
		producer: ctx.producer,
		topic,
		partition,
		messages: [
			ownershipTopic.serialize({
				record: {
					schemaVersion: 1,
					type: "unowned",
					partition,
					releasedAt,
				},
			}),
		],
	});

	return { routeEpoch: baseOffset.toString() };
}
