import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { readSubjectBaseline } from "../actions/ensureSubject/readSubjectBaseline.js";
import type { SubjectScope } from "../types/subject.js";
import { verifySnapshot } from "./actions/verifySnapshot.js";
import { warnSnapshotUnreadable } from "./actions/warnSnapshotUnreadable.js";
import { snapshotProbeOf } from "./rules/snapshotProbeOf.js";
import { snapshotStateOf } from "./rules/snapshotStateOf.js";

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
	if (row && probe === "serve") return row;
	const baseline = await readSubjectBaseline({ scope, identity, occurredAt });
	if (row) verifySnapshot({ scope, identity, snapshot: row, baseline });
	return baseline;
};
