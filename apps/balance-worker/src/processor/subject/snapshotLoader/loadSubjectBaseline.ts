import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import { servesSubjectSnapshots } from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import {
	readSubjectBaseline,
	subjectEnvelopeToState,
} from "../actions/ensureSubject/readSubjectBaseline.js";
import { SubjectNotFoundError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";
import { snapshotStateOf } from "./rules/snapshotStateOf.js";

/** A read further from now than this is a replay, which never trusts a row written for now. */
const SNAPSHOT_AS_OF_SKEW_MS = 1_000;

/**
 * The subject's rows at `occurredAt` in one round trip: its snapshot when the worker serves snapshots and the row
 * stands (parses), else the full rows. Nothing becomes resident here.
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
	const { snapshot, envelope } = await scope.ctx.db.getSubjectRows({
		identity,
		asOfTimestampMs: occurredAt,
		snapshotVersion: snapshotVersionAskedFor({ scope, occurredAt }),
	});
	if (snapshot !== null) {
		const served = snapshotStateOf({ snapshot });
		if (served) return served;
		// The row answered in place of the rows and cannot be used: one more statement, for the rows alone.
		scope.ctx.logger?.warn?.(
			{ event: "balance_worker.snapshot_unreadable", data: { identity } },
			`Balance worker could not read ${identity.customerId}'s snapshot; its next flush rewrites it`,
		);
		return readSubjectBaseline({ scope, identity, occurredAt });
	}
	if (!envelope) throw new SubjectNotFoundError({ identity });
	return subjectEnvelopeToState({ identity, envelope });
};

/** This build's version while serving and reading for now; undefined asks the statement for the rows alone. */
const snapshotVersionAskedFor = ({
	scope,
	occurredAt,
}: {
	scope: SubjectScope;
	occurredAt: number;
}): number | undefined => {
	const settings = scope.ctx.subjectSnapshotsConfig?.get();
	if (!settings || !servesSubjectSnapshots(settings)) return undefined;
	const skewMs = Math.abs(occurredAt - scope.ctx.receiptPolicy.now());
	return skewMs <= SNAPSHOT_AS_OF_SKEW_MS
		? BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION
		: undefined;
};
