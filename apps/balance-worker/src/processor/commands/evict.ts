import type { EvictCommand } from "@autumn/balance-engine";
import type { EvictReply } from "@autumn/balance-worker-client/protocol";
import { BALANCE_WORKER_EVICTS_LOGGED } from "@autumn/env/balanceWorkerConstants";
import { awaitSnapshotDeleteLanded } from "../actions/awaitSnapshotDeleteLanded.js";
import { dropStaleSubject } from "../actions/dropStaleSubject.js";
import { logEvict } from "../actions/logEvict.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

export async function evict({
	scope,
	command,
	waitsForSnapshotDelete,
}: {
	scope: PartitionProcessorScope;
	command: EvictCommand;
	waitsForSnapshotDelete: boolean;
}): Promise<EvictReply> {
	const { refreshSnapshots = false, ...evicting } = command;
	const { identity } = evicting;
	const customerIdentity = { ...identity, entityId: null };
	const droppedState = scope.ctx.writer.readFreshestState({
		identity: customerIdentity,
	});
	await dropStaleSubject({ scope, identity });
	if (waitsForSnapshotDelete || refreshSnapshots) {
		const deleted = await awaitSnapshotDeleteLanded({ scope, identity });
		if (refreshSnapshots && deleted.length > 0)
			scope.ctx.subjectHydrator.refreshSnapshots({
				customer: customerIdentity,
				subjects: deleted,
			});
	}
	if (logsEvicts({ scope }))
		await logEvict({ scope, command: evicting, droppedState });
	return { evicted: droppedState !== null };
}

const logsEvicts = ({ scope }: { scope: PartitionProcessorScope }): boolean =>
	(scope.ctx.config.logsEvicts ?? BALANCE_WORKER_EVICTS_LOGGED) &&
	scope.ctx.stateStore.baseline === "map";
