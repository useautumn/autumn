import type { Catalog, CommandOrg, SubjectState } from "@autumn/balance-engine";

/** `POST /v1/subjects.set`: one subject as its worker holds it, with the org settings a check reads. */
export type AtomSubjectBody = {
	state: SubjectState;
	catalog: Catalog;
	org: CommandOrg;
	/** A string: log offsets are 64-bit. */
	log_offset: string;
};

/** How one org's Atom is reached, as the org's record holds it: the token is still encrypted. */
export type AtomConnection = {
	endpointUrl: string;
	encryptedToken: string;
};

/** One org's Atom: its address and token are fixed when the client is made. */
export type AtomClient = {
	setSubject(params: { body: AtomSubjectBody }): Promise<void>;
};

/** Each org has its own Atom, so a client is made per connection. */
export type GetAtomClient = (params: {
	connection: AtomConnection;
}) => AtomClient;
