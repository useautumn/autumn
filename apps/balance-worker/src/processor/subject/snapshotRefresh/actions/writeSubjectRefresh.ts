import type { SubjectScope } from "../../types/subject.js";
import type { SnapshotRefreshRead } from "../types/snapshotRefreshQueue.js";

export const writeSubjectRefresh = ({
	scope,
	read,
}: {
	scope: SubjectScope;
	read: SnapshotRefreshRead;
}): void => {
	const { snapshotQueues, position } = scope.ctx;
	if (!snapshotQueues || !position) return;
	snapshotQueues.enqueueRefresh({
		...position,
		state: read.baseline,
		baselineAt: read.baselineAt,
		logOffset: read.logOffset,
	});
};
