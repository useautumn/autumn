import type { Organization } from "@autumn/shared";
import type { AtomConnection } from "../../../atom/types/atomClient.js";

/** An org whose env has a ready cache, and how its Atom is reached. */
export type CacheReadyOrg = {
	org: Organization;
	atomConnection: AtomConnection;
};
