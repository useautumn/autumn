import { type EvictCommand, parseEvictCommand } from "@autumn/balance-engine";
import type { EvictReply } from "@autumn/balance-worker-client/protocol";
import { BALANCE_WORKER_EVICTS_LOGGED } from "@autumn/env/balanceWorkerConstants";
import { dropStaleSubject } from "../actions/dropStaleSubject.js";
import { logEvict } from "../actions/logEvict.js";
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
	const droppedState = scope.ctx.writer.readFreshestState({
		identity: customerIdentity,
	});
	// A load still in flight started before this evict, so it must not put its rows back afterwards.
	await dropStaleSubject({ scope, identity });

	const logsEvicts =
		scope.ctx.config.logsEvicts ?? BALANCE_WORKER_EVICTS_LOGGED;
	// Postgres-backed only: the sqlite store would replay the record into rows it cannot drop.
	const storesInPostgres = scope.ctx.stateStore.baseline === "map";
	if (logsEvicts && storesInPostgres)
		await logEvict({ scope, command, droppedState });
	return { evicted: droppedState !== null };
}
