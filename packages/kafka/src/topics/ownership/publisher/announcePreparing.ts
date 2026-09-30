import { ownershipTopic } from "../ownershipTopic.js";
import type {
	OwnershipPreparation,
	OwnershipReadinessContext,
} from "./types/ownershipPublisher.js";

/** Sent through the plain producer like `ready`: nothing about preparing may fence the owner. */
export async function announcePreparing({
	ctx,
	topic,
	partition,
	endpoint,
	preparingAt,
}: OwnershipPreparation & {
	ctx: OwnershipReadinessContext;
	topic: string;
}): Promise<void> {
	const message = ownershipTopic.serialize({
		record: {
			schemaVersion: 1,
			type: "preparing",
			partition,
			endpoint,
			preparingAt,
		},
	});
	await ctx.sender.send({
		topic,
		messages: [{ ...message, partition }],
		acks: -1,
	});
}
