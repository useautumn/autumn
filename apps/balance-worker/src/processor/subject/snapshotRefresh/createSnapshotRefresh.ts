import { defaultSubjectSnapshotsEdgeConfig } from "@autumn/edge-config";
import { databaseTimings } from "../../../logging/databaseTimings.js";
import type { SubjectHydratorContext, SubjectScope } from "../types/subject.js";
import { readSubjectForRefresh } from "./actions/readSubjectForRefresh.js";
import { writeSubjectRefresh } from "./actions/writeSubjectRefresh.js";
import { createSnapshotRefreshQueue } from "./createSnapshotRefreshQueue.js";
import type { SnapshotRefreshQueue } from "./types/snapshotRefreshQueue.js";

export const createSnapshotRefresh = ({
	ctx,
	scopeOf,
}: {
	ctx: Pick<SubjectHydratorContext, "subjectSnapshotsConfig" | "logger">;
	scopeOf: () => SubjectScope;
}): SnapshotRefreshQueue =>
	createSnapshotRefreshQueue({
		ctx: {
			read: ({ identity }) =>
				readSubjectForRefresh({ scope: scopeOf(), identity }),
			write: ({ read }) => writeSubjectRefresh({ scope: scopeOf(), read }),
			subjectSnapshotsConfig: ctx.subjectSnapshotsConfig ?? {
				get: defaultSubjectSnapshotsEdgeConfig,
			},
			recordCounts: databaseTimings.recordSnapshotRefreshes,
			logger: ctx.logger,
		},
	});
