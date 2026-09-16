import { sendTransactionalBatch } from "../../../producer/sendTransactionalBatch.js";
import { ownershipTopic } from "../ownershipTopic.js";
import type {
	OwnershipClaim,
	OwnershipPublication,
	OwnershipPublisherContext,
} from "./types/ownershipPublisher.js";

export async function claimPartition({
	ctx,
	topic,
	partition,
	endpoint,
	claimedAt,
}: OwnershipClaim & {
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
					type: "claimed",
					partition,
					endpoint,
					claimedAt,
				},
			}),
		],
	});

	return { routeEpoch: baseOffset.toString() };
}
