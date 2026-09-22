import {
	type MutationRecord,
	revertChanges,
	subjectStateToFullSubject,
	type WorkerFullSubject,
} from "@autumn/balance-engine";

/** A lock holds no balance, and a deleted lock's row is gone from memory, so a lock change is neither reverted nor needed. */
const isBalanceChange = (change: MutationRecord["changes"][number]): boolean =>
	change.table !== "locks";

/**
 * The subject as the mutation found it and as it left it, from the record alone. Null on a record written before
 * the log carried the subject, or on one that moved nothing.
 */
export const recordToSubjects = ({
	record,
}: {
	record: MutationRecord;
}): { before: WorkerFullSubject; after: WorkerFullSubject } | null => {
	if (!record.after) return null;
	const changes = record.changes.filter(isBalanceChange);
	if (changes.length === 0) return null;

	const { state, catalog } = record.after;
	const entityId = record.identity.entityId;
	return {
		before: subjectStateToFullSubject({
			state: revertChanges({ state, changes }),
			catalog,
			entityId,
		}),
		after: subjectStateToFullSubject({ state, catalog, entityId }),
	};
};
