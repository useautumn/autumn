import type { MultiTenantAuth } from "./createMultiTenantAuth.js";

/** What a multi-tenant Atom adds to a thread: the Atoms the admin puts and deletes, and the admin token's hash. */
export type MultiTenantContext = {
	auth: MultiTenantAuth;
	adminTokenHash: string;
};
