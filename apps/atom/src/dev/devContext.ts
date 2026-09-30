import type { DevAuth } from "./createDevAuth.js";

/** What a dev stack adds to an Atom process: the Atoms its server puts and deletes. */
export type DevContext = { auth: DevAuth };
