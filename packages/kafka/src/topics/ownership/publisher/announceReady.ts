import { ownershipTopic } from "../ownershipTopic.js";
import type {
	OwnershipReadiness,
	OwnershipReadinessContext,
} from "./types/ownershipPublisher.js";

export async function announceReady({
	ctx,
	topic,
	partition,
	endpoint,
	readyAt,
}: OwnershipReadiness & {
	ctx: OwnershipReadinessContext;
	topic: string;
}): Promise<void> {
	const message = ownershipTopic.serialize({
		record: { schemaVersion: 1, type: "ready", partition, endpoint, readyAt },
	});
	await ctx.sender.send({
		topic,
		messages: [{ ...message, partition }],
		acks: -1,
	});
}
