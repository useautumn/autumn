/** An Atom's `pushes` queue, by the alien deployment group that holds it; a multi-tenant Atom also needs the folder. */
export type AtomQueueAddress = { externalId: string; atomId: string | null };

/** How one Atom is reached, its token still encrypted. `org` is the org's own Atom; `shadow` is ours, test-only. */
export type AtomConnection = {
	target: "org" | "shadow";
	/** The org Atom's id, as `tracks.append` stamps the deductions it hands in; null for the shadow Atom, which hands in none. */
	id: string | null;
	endpointUrl: string;
	encryptedToken: string;
	/** Set when pushes go through the Atom's queue; HTTP to `endpointUrl` stays the fallback. */
	queue: AtomQueueAddress | null;
};
