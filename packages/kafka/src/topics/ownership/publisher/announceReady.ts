import { ownershipTopic } from "../ownershipTopic.js";
import type {
	OwnershipReadiness,
	OwnershipReadinessContext,
} from "./types/ownershipPublisher.js";

/** Sent outside any transaction: the successor's own producer must not fence the
 *  predecessor's until the handoff says so, and a fence is what its first
 *  transaction would be. */
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
