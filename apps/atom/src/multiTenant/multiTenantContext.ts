import type { MultiTenantAuth } from "./createMultiTenantAuth.js";

export type MultiTenantContext = {
	auth: MultiTenantAuth;
	adminTokenHash: string;
};
