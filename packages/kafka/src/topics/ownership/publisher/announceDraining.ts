import { ownershipTopic } from "../ownershipTopic.js";
import type {
	OwnershipDraining,
	OwnershipReadinessContext,
} from "./types/ownershipPublisher.js";

/** Sent through the plain producer like `ready`: the owner's transactional
 *  producer is busy committing the very work this record says it is draining. */
export async function announceDraining({
	ctx,
	topic,
	partition,
	endpoint,
	drainingAt,
}: OwnershipDraining & {
	ctx: OwnershipReadinessContext;
	topic: string;
}): Promise<void> {
	const message = ownershipTopic.serialize({
		record: {
			schemaVersion: 1,
			type: "draining",
			partition,
			endpoint,
			drainingAt,
		},
	});
	await ctx.sender.send({
		topic,
		messages: [{ ...message, partition }],
		acks: -1,
	});
}
