import { ownershipTopic } from "../ownershipTopic.js";
import type {
	OwnershipDraining,
	OwnershipReadinessContext,
} from "./types/ownershipPublisher.js";

export async function announceDraining({
	ctx,
	topic,
	partition,
	endpoint,
	successor,
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
			successor,
			drainingAt,
		},
	});
	await ctx.sender.send({
		topic,
		messages: [{ ...message, partition }],
		acks: -1,
	});
}
