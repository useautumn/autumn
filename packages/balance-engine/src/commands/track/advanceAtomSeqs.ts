import type { SubjectState } from "../../models/subject/subjectState.js";
import type { TrackSource } from "./types/trackCommand.js";

/** A track an Atom handed in raises that Atom's seq on the customer; nothing lowers it. */
export const advanceAtomSeqs = ({
	atomSeqs,
	source,
}: {
	atomSeqs: SubjectState["atomSeqs"];
	source: TrackSource;
}): NonNullable<SubjectState["atomSeqs"]> => ({
	...atomSeqs,
	[source.atomId]: Math.max(atomSeqs?.[source.atomId] ?? 0, source.seq),
});
