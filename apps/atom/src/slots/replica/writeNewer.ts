import type { AppliedSubject } from "../../state/repos/subjectStates.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";

type Version = { readAt: number; logOffset: bigint };

export const isNewer = (a: Version, b: Version) =>
	a.readAt > b.readAt || (a.readAt === b.readAt && a.logOffset > b.logOffset);

/** Only what is newer than the row held is written, so a pass over what is already held rewrites nothing. */
export const writeNewer = ({
	store,
	page,
}: {
	store: SqliteStore;
	page: AppliedSubject[];
}): number => {
	const subjects = page
		.map(({ subject }) => subject)
		.filter((subject) => {
			const { customerId, entityId } = subject.state.identity;
			const held = store.readVersion({
				customerId,
				entityId: entityId ?? null,
			});
			return !held || isNewer(subject, held);
		});
	if (subjects.length === 0) return 0;
	return store.setSubjects({ subjects }).filter(Boolean).length;
};
