import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerLock } from "../../models/subject/rows/workerLock.js";

/** The lock row a mutation inserts: a locked track's; null for any other. */
export const findLockInsertInMutation = ({
	mutation,
}: {
	mutation: SubjectStateMutation;
}): WorkerLock | null => {
	for (const change of mutation.changes)
		if (change.table === "locks" && change.op === "insert") return change.row;
	return null;
};
