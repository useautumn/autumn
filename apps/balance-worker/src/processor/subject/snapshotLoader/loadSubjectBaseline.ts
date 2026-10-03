import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { servesSubjectSnapshots } from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import { readSubjectBaseline } from "../actions/ensureSubject/readSubjectBaseline.js";
import type { SubjectScope } from "../types/subject.js";

/** The subject's rows at `occurredAt`: from the partition's snapshot loader when the worker serves snapshots, else the full query. */
export const loadSubjectBaseline = ({
	scope,
	identity,
	occurredAt,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	occurredAt: number;
}): Promise<SubjectState> =>
	servesSubjectSnapshots(
		scope.ctx.subjectSnapshotsConfig?.get() ?? { mode: "off" },
	)
		? scope.state.snapshotLoader.load({ identity, asOf: occurredAt })
		: readSubjectBaseline({ scope, identity, occurredAt });
