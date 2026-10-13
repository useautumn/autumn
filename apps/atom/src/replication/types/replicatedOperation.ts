/**
 * One operation a replica applied and passes on to the others. `key` names what it changes, so a newer copy for the
 * same key replaces an older one still waiting; `body` is the text the handler applies, unchanged from how it arrived.
 */
export type ReplicatedOperation = {
	kind: string;
	key: string;
	body: string;
	/** The folder it applies to: a tenant on a multi-tenant Atom, null for an org's own Atom's one folder. */
	atomId: string | null;
	/** Headers the kind's route needs beside the body, like the customer id a subject push is routed by. */
	headers?: Record<string, string>;
};
