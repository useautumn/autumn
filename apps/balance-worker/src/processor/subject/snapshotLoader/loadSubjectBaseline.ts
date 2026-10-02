import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { servesSubjectSnapshots } from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import { readSubjectBaseline } from "../actions/ensureSubject/readSubjectBaseline.js";
import type { InFlightLoad } from "../inFlightLoads/types/inFlightLoad.js";
import type { SubjectScope } from "../types/subject.js";

/** The subject's rows at `occurredAt`: from the partition's snapshot loader when the worker serves snapshots, else the full query. */
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
}): Promise<SubjectState> =>
	servesSubjectSnapshots(
		scope.ctx.subjectSnapshotsConfig?.get() ?? { mode: "off" },
	)
		? scope.state.snapshotLoader.load({
				identity,
				asOf: occurredAt,
				overtaken: () => load.overtaken,
			})
		: readSubjectBaseline({ scope, identity, occurredAt });
