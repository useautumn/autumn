import type { AtomEnv } from "@autumn/env/atom";
import type { AtomProcessRole } from "./types/atomProcessRole.js";

/** A lone process does both; among the supervisor's, the first `ATOM_WRITERS` receive and the rest serve. */
export const atomProcessRole = ({
	env,
	childIndex,
}: {
	env: AtomEnv;
	/** Null for a process the supervisor did not start. */
	childIndex: number | null;
}): AtomProcessRole => {
	const receivesAny = env.ATOM_WRITERS > 0;
	if (childIndex === null)
		return { servesChecks: true, receivesPushes: receivesAny };
	const isWriter = childIndex < env.ATOM_WRITERS;
	return { servesChecks: !isWriter, receivesPushes: isWriter };
};
