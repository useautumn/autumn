/** An Atom's `pushes` queue, by the alien deployment group that holds it; a multi-tenant Atom also needs the folder. */
export type AtomQueueAddress = { externalId: string; atomId: string | null };

/** How one Atom is reached, its token still encrypted. `org` is the org's own Atom; `shadow` is ours, test-only. */
export type AtomConnection = {
	target: "org" | "shadow";
	endpointUrl: string;
	encryptedToken: string;
	/** Set when pushes go through the Atom's queue; HTTP to `endpointUrl` stays the fallback. */
	queue: AtomQueueAddress | null;
};
