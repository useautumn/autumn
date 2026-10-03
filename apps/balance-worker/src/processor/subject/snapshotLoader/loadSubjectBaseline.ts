import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { servesSubjectSnapshots } from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import { readSubjectBaseline } from "../actions/ensureSubject/readSubjectBaseline.js";
import type { SubjectScope } from "../types/subject.js";
import { snapshotStateOf } from "./rules/snapshotStateOf.js";

/** A read further from now than this is a replay, which never trusts a row written for now. */
const SNAPSHOT_AS_OF_SKEW_MS = 1_000;

/**
 * The subject's rows at `occurredAt`: one probe for its snapshot when the worker serves snapshots and the read is for
 * now, answered from the row when it stands (parses), else the full rows. Nothing becomes resident here.
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
	if (!probesSnapshot({ scope, occurredAt }))
		return readSubjectBaseline({ scope, identity, occurredAt });
	const snapshot = await scope.ctx.db.readSubjectSnapshot({ identity });
	if (snapshot !== null) {
		const served = snapshotStateOf({ snapshot });
		if (served) return served;
		scope.ctx.logger?.warn?.(
			{ event: "balance_worker.snapshot_unreadable", data: { identity } },
			`Balance worker could not read ${identity.customerId}'s snapshot; its next flush rewrites it`,
		);
	}
	return readSubjectBaseline({ scope, identity, occurredAt });
};

/** Serving, and reading for now: a replay never trusts a row written for now. */
const probesSnapshot = ({
	scope,
	occurredAt,
}: {
	scope: SubjectScope;
	occurredAt: number;
}): boolean => {
	const settings = scope.ctx.subjectSnapshotsConfig?.get();
	if (!settings || !servesSubjectSnapshots(settings)) return false;
	return (
		Math.abs(occurredAt - scope.ctx.receiptPolicy.now()) <=
		SNAPSHOT_AS_OF_SKEW_MS
	);
};
