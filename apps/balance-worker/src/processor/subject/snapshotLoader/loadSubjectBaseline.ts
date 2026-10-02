import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import {
	readsSubjectSnapshots,
	servesSubjectSnapshots,
} from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import {
	readSubjectBaseline,
	subjectEnvelopeToState,
} from "../actions/ensureSubject/readSubjectBaseline.js";
import type { InFlightLoad } from "../inFlightLoads/types/inFlightLoad.js";
import { SubjectNotFoundError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";
import { backfillSnapshot } from "./actions/backfillSnapshot.js";
import { verifySnapshot } from "./actions/verifySnapshot.js";
import { warnSnapshotUnreadable } from "./actions/warnSnapshotUnreadable.js";
import { snapshotStateOf } from "./rules/snapshotStateOf.js";

/** A read further from now than this is a replay, which never trusts a row written for now. */
const SNAPSHOT_AS_OF_SKEW_MS = 1_000;

/**
 * The subject's rows at `occurredAt` in one round trip: its snapshot when the worker serves snapshots and the row
 * stands (parses), else the full rows, which are written back for the next cold load. Verifying reads both at once
 * and serves the rows, logging where the row disagrees. Nothing becomes resident here.
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
	const snapshotVersion = readsSubjectSnapshots({ mode })
		? snapshotVersionAskedFor({ scope, occurredAt })
		: undefined;
	const serving = servesSubjectSnapshots({ mode });
	const { snapshot, envelope } = await scope.ctx.db.getSubjectRows({
		identity,
		asOfTimestampMs: occurredAt,
		snapshotVersion,
		rowsBesideSnapshot: !serving,
	});
	if (snapshot !== null && serving) {
		const served = snapshotStateOf({ snapshot });
		if (served) return served;
		// The row answered in place of the rows and cannot be used: one more statement, for the rows alone.
		warnSnapshotUnreadable({ scope, identity });
		return readSubjectBaseline({ scope, identity, occurredAt });
	}
	if (!envelope) throw new SubjectNotFoundError({ identity });
	const baseline = subjectEnvelopeToState({ identity, envelope });
	if (snapshot !== null)
		verifySnapshot({ scope, identity, snapshot, baseline });
	else if (snapshotVersion !== undefined && !load.overtaken)
		backfillSnapshot({ scope, identity, baseline, baselineAt: occurredAt });
	return baseline;
};

/** This build's version while reading for now; undefined asks the statement for the rows alone. */
const snapshotVersionAskedFor = ({
	scope,
	occurredAt,
}: {
	scope: SubjectScope;
	occurredAt: number;
}): number | undefined => {
	const skewMs = Math.abs(occurredAt - scope.ctx.receiptPolicy.now());
	return skewMs <= SNAPSHOT_AS_OF_SKEW_MS
		? BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION
		: undefined;
};
