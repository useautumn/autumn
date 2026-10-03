import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import {
	readsSubjectSnapshots,
	servesSubjectSnapshots,
} from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import { readSubjectBaseline } from "../actions/ensureSubject/readSubjectBaseline.js";
import type { InFlightLoad } from "../inFlightLoads/types/inFlightLoad.js";
import type { SubjectScope } from "../types/subject.js";
import { backfillSnapshot } from "./actions/backfillSnapshot.js";
import { verifySnapshot } from "./actions/verifySnapshot.js";
import { warnSnapshotUnreadable } from "./actions/warnSnapshotUnreadable.js";
import { snapshotStateOf } from "./rules/snapshotStateOf.js";

/** A read further from now than this is a replay, which never trusts a row written for now. */
const SNAPSHOT_AS_OF_SKEW_MS = 1_000;

/**
 * The subject's rows at `occurredAt`: one probe for its snapshot when the worker reads snapshots and the read is for
 * now. Serving answers from a row that stands (parses); verifying reads the rows anyway and logs where the row
 * disagrees. Rows read after a miss are written back for the next cold load. Nothing becomes resident here.
 */
export const loadSubjectBaseline = async ({
	scope,
	identity,
	occurredAt,
	load,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	occurredAt: number;
	load: InFlightLoad;
}): Promise<SubjectState> => {
	const mode = scope.ctx.subjectSnapshotsConfig?.get().mode ?? "off";
	if (!readsSubjectSnapshots({ mode }) || isReplay({ scope, occurredAt }))
		return readSubjectBaseline({ scope, identity, occurredAt });
	const snapshot = await scope.ctx.db.readSubjectSnapshot({ identity });
	const row = snapshot === null ? null : snapshotStateOf({ snapshot });
	if (snapshot !== null && !row) warnSnapshotUnreadable({ scope, identity });
	if (row && servesSubjectSnapshots({ mode })) return row;
	const baseline = await readSubjectBaseline({ scope, identity, occurredAt });
	if (row) verifySnapshot({ scope, identity, snapshot: row, baseline });
	else if (snapshot === null && !load.overtaken)
		backfillSnapshot({ scope, identity, baseline, baselineAt: occurredAt });
	return baseline;
};

/** A read further from now than the skew never trusts a row written for now. */
const isReplay = ({
	scope,
	occurredAt,
}: {
	scope: SubjectScope;
	occurredAt: number;
}): boolean =>
	Math.abs(occurredAt - scope.ctx.receiptPolicy.now()) > SNAPSHOT_AS_OF_SKEW_MS;
