import type { SubjectScope } from "../../types/subject.js";
import type { SubjectRead } from "../../types/subjectRead.js";

/** The read becomes the subject's row through the partition's lane, bookmark-fenced; a store without the lane owes nothing. */
export const writeSubjectRefresh = ({
	scope,
	read,
}: {
	scope: SubjectScope;
	read: SubjectRead;
}): void => {
	const { snapshotQueues, position } = scope.ctx;
	if (!snapshotQueues || !position) return;
	snapshotQueues.enqueueRefresh({
		...position,
		state: read.baseline,
		baselineAt: read.baselineAt,
	});
};
