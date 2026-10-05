import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { databaseTimings } from "../../../logging/databaseTimings.js";
import { readSubjectBaseline } from "../actions/ensureSubject/readSubjectBaseline.js";
import type { SubjectScope } from "../types/subject.js";
import { verifySnapshot } from "./actions/verifySnapshot.js";
import { warnSnapshotUnreadable } from "./actions/warnSnapshotUnreadable.js";
import { snapshotProbeOf } from "./rules/snapshotProbeOf.js";
import { snapshotStateOf } from "./rules/snapshotStateOf.js";

/**
 * The subject's rows at `occurredAt`: one probe for its snapshot when the worker reads snapshots and the read is for
 * now. Serving answers from a row that stands (parses); verifying reads the rows anyway and logs where the row
 * disagrees. Nothing becomes resident here.
 */
export const loadSubjectBaseline = async ({
	scope,
	identity,
	occurredAt,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	occurredAt: number;
}): Promise<SubjectState> => {
	const probe = snapshotProbeOf({ scope, occurredAt });
	if (probe === "none")
		return readSubjectBaseline({ scope, identity, occurredAt });
	const snapshot = await scope.ctx.db.readSubjectSnapshot({ identity });
	const row = snapshot === null ? null : snapshotStateOf({ snapshot });
	if (snapshot !== null && !row) warnSnapshotUnreadable({ scope, identity });
	if (row && probe === "serve") {
		databaseTimings.recordSubjectSnapshots({ served: 1 });
		return row;
	}
	const baseline = await readSubjectBaseline({ scope, identity, occurredAt });
	if (row) verifySnapshot({ scope, identity, snapshot: row, baseline });
	return baseline;
};
