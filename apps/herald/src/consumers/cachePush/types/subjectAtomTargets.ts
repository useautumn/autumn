import type { Organization } from "@autumn/shared";
import type { AtomConnection } from "../../../atom/types/atomClient.js";

/** A subject's org, and every Atom the subject is pushed to. */
export type SubjectAtomTargets = {
	org: Organization;
	atomConnections: AtomConnection[];
};
