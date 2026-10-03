import { defaultSubjectSnapshotsEdgeConfig } from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { SubjectHydratorContext, SubjectScope } from "../types/subject.js";
import { readSubjectForRefresh } from "./actions/readSubjectForRefresh.js";
import { writeSubjectRefresh } from "./actions/writeSubjectRefresh.js";
import { createSnapshotRefreshQueue } from "./createSnapshotRefreshQueue.js";
import type { SnapshotRefreshQueue } from "./types/snapshotRefreshQueue.js";

/** The partition's refresh queue over its hydrator: reads share the loads in flight, writes go through the lane. */
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
			// Without the settings nothing is ever queued; the defaults only type the bounds.
			subjectSnapshotsConfig: ctx.subjectSnapshotsConfig ?? {
				get: defaultSubjectSnapshotsEdgeConfig,
			},
			logger: ctx.logger,
		},
	});
