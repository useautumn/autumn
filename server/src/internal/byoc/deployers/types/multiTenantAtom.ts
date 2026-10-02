/** Where a multi-tenant Atom answers, and the admin token its `atoms.*` routes need. */
export type MultiTenantAtomAddress = { atomUrl: string; adminToken: string };

export type MultiTenantAtomRoute = "atoms.put" | "atoms.get" | "atoms.delete";

/** Our shadow Atom, as the admin routes register orgs on it. Never an org's own Atom. */
export type MultiTenantAtomDeployer = {
	/** Mints the org's token and gives the Atom only its hash; registering again replaces the token. */
	register(params: { atomId: string }): Promise<{ token: string }>;
	/** Deletes the org's folder; unregistering one that is not held is a no-op. */
	unregister(params: { atomId: string }): Promise<void>;
};
