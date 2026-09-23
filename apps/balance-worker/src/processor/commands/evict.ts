import { type EvictCommand, parseEvictCommand } from "@autumn/balance-engine";
import type { EvictReply } from "@autumn/balance-worker-client/protocol";
import { dropStaleSubject } from "../actions/dropStaleSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** Another writer changed the customer's rows: forget them, the next command hydrates afresh. */
export async function evict({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: EvictCommand;
}): Promise<EvictReply> {
	const { identity } = parseEvictCommand({ input: command });
	const customerIdentity = { ...identity, entityId: null };
	const wasResident =
		scope.ctx.writer.readFreshestState({ identity: customerIdentity }) !== null;
	// A load still in flight started before this evict, so it must not put its rows back afterwards.
	await dropStaleSubject({ scope, identity });
	return { evicted: wasResident };
}
