import type { Organization } from "@autumn/shared";
import type { AtomConnection } from "../../../atom/types/atomClient.js";

export type SubjectAtomTargets = {
	org: Organization;
	atomConnections: AtomConnection[];
};
