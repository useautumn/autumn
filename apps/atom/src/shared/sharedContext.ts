import type { SharedAuth } from "./createSharedAuth.js";

/** What a shared Atom adds to a process: the Atoms the admin puts and deletes, and the admin token's hash. */
export type SharedContext = { auth: SharedAuth; adminTokenHash: string };
