import {
	readsSubjectSnapshots,
	servesSubjectSnapshots,
} from "@autumn/edge-config";
import type { SubjectScope } from "../../types/subject.js";

/** A read further from now than this is a replay, which never trusts a row written for now. */
const SNAPSHOT_AS_OF_SKEW_MS = 1_000;

/** What a cold read does with the subject's snapshot row: nothing, serve it, or read the rows anyway and verify it. */
export type SnapshotProbe = "none" | "serve" | "verify";

/** One decision for every cold read, the customer's or an entity's: the mode, read now, and whether the read is for now. */
export const snapshotProbeOf = ({
	scope,
	occurredAt,
}: {
	scope: SubjectScope;
	occurredAt: number;
}): SnapshotProbe => {
	const mode = scope.ctx.subjectSnapshotsConfig?.get().mode ?? "off";
	const isReplay =
		Math.abs(occurredAt - scope.ctx.receiptPolicy.now()) >
		SNAPSHOT_AS_OF_SKEW_MS;
	if (!readsSubjectSnapshots({ mode }) || isReplay) return "none";
	return servesSubjectSnapshots({ mode }) ? "serve" : "verify";
};
