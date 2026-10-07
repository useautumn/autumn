import type { SubjectState } from "@autumn/balance-engine";
import { warnSnapshotUnreadable } from "../../snapshotLoader/actions/warnSnapshotUnreadable.js";
import type { SnapshotProbe } from "../../snapshotLoader/rules/snapshotProbeOf.js";
import { snapshotStateOf } from "../../snapshotLoader/rules/snapshotStateOf.js";
import type { SubjectScope } from "../../types/subject.js";
import type { WaitingEntity } from "../types/entityLoads.js";

/** The rows the probe answered, by the entity waiting for them; what to do with each is the caller's, as the probe says. */
export type EntitySnapshotRows = Map<WaitingEntity, SubjectState>;

/**
 * One statement for every entity in the batch that may take a row: those whose snapshot parses are returned; an
 * unreadable row is warned about and read whole like a miss. `none`, or every entity rows-only, probes nothing.
 */
export const probeEntitySnapshots = async ({
	scope,
	batch,
	probe,
}: {
	scope: SubjectScope;
	batch: readonly WaitingEntity[];
	probe: SnapshotProbe;
}): Promise<EntitySnapshotRows> => {
	const rows: EntitySnapshotRows = new Map();
	const probing =
		probe === "none" ? [] : batch.filter((waiting) => !waiting.rowsOnly);
	const first = probing[0];
	if (!first) return rows;
	const snapshots = await scope.ctx.db.readEntitySubjectSnapshots({
		identity: { ...first.identity, entityId: null },
		entityIds: probing.flatMap((waiting) =>
			waiting.identity.entityId ? [waiting.identity.entityId] : [],
		),
	});
	for (const waiting of probing) {
		const snapshot = snapshots.get(waiting.identity.entityId ?? "");
		if (snapshot === undefined) continue;
		const row = snapshotStateOf({ snapshot });
		if (row) rows.set(waiting, row);
		else warnSnapshotUnreadable({ scope, identity: waiting.identity });
	}
	return rows;
};
