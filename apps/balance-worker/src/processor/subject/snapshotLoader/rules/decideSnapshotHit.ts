import {
	type MeteringIdentity,
	meteringIdentityToSubjectKey,
	parseSubjectState,
} from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type { SubjectSnapshotRow } from "@autumn/postgres";
import type { SnapshotHit } from "../types/snapshotHit.js";

/** A read further from now than this is a replay, which never trusts a row written for now. */
export const SNAPSHOT_AS_OF_SKEW_MS = 1_000;

/**
 * Whether a row may stand in for the subject's full read at `asOf`: written by this build, younger than the
 * TTL since its last full read, parseable, and naming exactly this subject. Anything else is a miss, by reason.
 */
export const decideSnapshotHit = ({
	row,
	identity,
	asOf,
	now,
	ttlMs,
}: {
	row: SubjectSnapshotRow | undefined;
	identity: MeteringIdentity;
	asOf: number;
	now: number;
	ttlMs: number;
}): SnapshotHit => {
	if (Math.abs(asOf - now) > SNAPSHOT_AS_OF_SKEW_MS)
		return { hit: false, reason: "asOf" };
	if (!row) return { hit: false, reason: "absent" };
	if (row.stateVersion !== BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION)
		return { hit: false, reason: "version" };
	if (now - row.baselineAt >= ttlMs) return { hit: false, reason: "expired" };
	const state = parsedStateOf({ row });
	if (!state) return { hit: false, reason: "parse" };
	if (
		meteringIdentityToSubjectKey({ identity: state.identity }) !==
		meteringIdentityToSubjectKey({ identity })
	)
		return { hit: false, reason: "identity" };
	// What a full read answers: the resident revision starts from zero and counts this process's mutations.
	return { hit: true, state: { ...state, revision: 0 } };
};

const parsedStateOf = ({ row }: { row: SubjectSnapshotRow }) => {
	try {
		return parseSubjectState({ input: row.state });
	} catch {
		return null;
	}
};
