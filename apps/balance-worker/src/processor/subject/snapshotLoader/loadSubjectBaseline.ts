import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { servesSubjectSnapshots } from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import { readSubjectBaseline } from "../actions/ensureSubject/readSubjectBaseline.js";
import type { InFlightLoad } from "../inFlightLoads/types/inFlightLoad.js";
import type { SubjectScope } from "../types/subject.js";

/** A read further from now than this is a replay, which never trusts a row written for now. */
const SNAPSHOT_AS_OF_SKEW_MS = 1_000;

/**
 * The subject's rows at `occurredAt`: from the partition's snapshot loader when the worker serves snapshots and the
 * read is for now, else the full query.
 */
export const loadSubjectBaseline = ({
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
	const settings = scope.ctx.subjectSnapshotsConfig?.get();
	const skewMs = Math.abs(occurredAt - scope.ctx.receiptPolicy.now());
	return settings &&
		servesSubjectSnapshots(settings) &&
		skewMs <= SNAPSHOT_AS_OF_SKEW_MS
		? scope.state.snapshotLoader.load({
				identity,
				asOf: occurredAt,
				overtaken: () => load.overtaken,
			})
		: readSubjectBaseline({ scope, identity, occurredAt });
};
