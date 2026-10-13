import type { AtomSubjectBody } from "./types/atomSubjectBody.js";

/** One Atom's copy of a subject: `atom_seq` is how far `state` holds that Atom's own journal. */
export const atomSubjectBodyFor = ({
	body,
	atomId,
}: {
	body: AtomSubjectBody;
	atomId: string | null;
}): AtomSubjectBody => ({
	...body,
	atom_seq: atomId ? (body.state.atomSeqs?.[atomId] ?? null) : null,
});
