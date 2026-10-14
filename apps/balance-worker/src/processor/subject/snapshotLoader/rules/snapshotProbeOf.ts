import {
	readsSubjectSnapshots,
	servesSubjectSnapshots,
} from "@autumn/edge-config";
import type { SubjectScope } from "../../types/subject.js";

const SNAPSHOT_AS_OF_SKEW_MS = 1_000;

export type SnapshotProbe = "none" | "serve" | "verify";

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
