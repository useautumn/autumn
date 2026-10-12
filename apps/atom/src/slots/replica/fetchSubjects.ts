import type { AppliedSubject } from "../../state/repos/subjectStates.js";
import type { SubjectKey } from "../types/slots.js";
import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

/** A slot's rows by key, answered by the slot's owner. */
export const fetchSubjects = async ({
	ctx,
	slot,
	keys,
}: {
	ctx: ReplicaSlotsContext;
	slot: number;
	keys: SubjectKey[];
}): Promise<AppliedSubject[]> => {
	const store = ctx.slots[slot]?.sqliteStore;
	if (store) return store.readByKey({ keys });
	const owner = ctx.owners.ownerOf({ slot });
	return ctx.owners.fetchSubjectsOn({
		thread: owner,
		atomId: ctx.atomId,
		slot,
		keys,
	});
};
