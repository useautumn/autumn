import type { AtomEnv } from "@autumn/env/atom";
import type { AtomProcessRole } from "./types/atomProcessRole.js";

/** Every process serves; a lone process also receives, and among the supervisor's the first `ATOM_WRITERS` do. */
export const atomProcessRole = ({
	env,
	childIndex,
}: {
	env: AtomEnv;
	/** Null for a process the supervisor did not start. */
	childIndex: number | null;
}): AtomProcessRole => ({
	receivesPushes:
		childIndex === null ? env.ATOM_WRITERS > 0 : childIndex < env.ATOM_WRITERS,
});
