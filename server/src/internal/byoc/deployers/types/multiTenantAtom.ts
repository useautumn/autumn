export type MultiTenantAtomAddress = { atomUrl: string; adminToken: string };

export type MultiTenantAtomRoute = "atoms.put" | "atoms.get" | "atoms.delete";

export type MultiTenantAtomDeployer = {
	register(params: { atomId: string }): Promise<{ token: string }>;
	unregister(params: { atomId: string }): Promise<void>;
};
