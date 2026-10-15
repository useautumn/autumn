import type { AtomSubjectBody } from "./types/atomSubjectBody.js";

/** One Atom's copy of a subject: `atom_seqs` is how far `state` holds each of that Atom's own journals. */
export const atomSubjectBodyFor = ({
	body,
	atomId,
}: {
	body: AtomSubjectBody;
	atomId: string | null;
}): AtomSubjectBody => ({
	...body,
	atom_seqs: atomId ? (body.state.customer.atom_seqs?.[atomId] ?? null) : null,
});
