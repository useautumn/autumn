import type { AppliedSubject } from "../../state/repos/subjectStates.js";
import type { SinceRequest } from "../types/slots.js";
import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

/** A slot's subjects written at or after `after`, answered by the slot's owner. */
export const listSince = async ({
	ctx,
	...params
}: { ctx: ReplicaSlotsContext } & SinceRequest): Promise<AppliedSubject[]> => {
	const store = ctx.slots[params.slot]?.sqliteStore;
	if (store) return store.listAppliedAfter(params);
	const owner = ctx.owners.ownerOf({ slot: params.slot });
	return ctx.owners.listSinceOn({
		thread: owner,
		atomId: ctx.atomId,
		...params,
	});
};
