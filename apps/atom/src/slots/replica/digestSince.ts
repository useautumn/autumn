import type { SubjectDigest } from "../../state/repos/subjectStates.js";
import type { SinceRequest } from "../types/slots.js";
import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

/** The same pages as `listSince`, as identities and versions only. */
export const digestSince = async ({
	ctx,
	...params
}: { ctx: ReplicaSlotsContext } & SinceRequest): Promise<SubjectDigest[]> => {
	const store = ctx.slots[params.slot]?.sqliteStore;
	if (store) return store.listDigestsAfter(params);
	const owner = ctx.owners.ownerOf({ slot: params.slot });
	return ctx.owners.digestSinceOn({
		thread: owner,
		atomId: ctx.atomId,
		...params,
	});
};
