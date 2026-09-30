import type { Catalog, CatalogRow, SubjectState } from "@autumn/balance-engine";
import type { SharedContext } from "@autumn/shared";
import type { RetryPolicy } from "../retryWithBackoff.js";

/** `POST /v1/subjects.set`: one subject as its worker holds it, with the org settings a check reads. */
export type AtomSubjectBody = {
	state: SubjectState;
	catalog: Catalog;
	org: SharedContext["org"];
	/** A string: log offsets are 64-bit. */
	log_offset: string;
	/** When Autumn read the subject from its worker, in epoch ms. */
	read_at: number;
};

/** How one org's Atom is reached, as the org's record holds it: the token is still encrypted. */
export type AtomConnection = {
	endpointUrl: string;
	encryptedToken: string;
};

/** How hard one kind of push is tried; `retry` null sends it once. */
export type AtomDelivery = {
	/** For each attempt. */
	timeoutMs: number;
	retry: RetryPolicy | null;
};

/** One org's Atom: its address and token are fixed when the client is made. */
export type AtomClient = {
	setSubject(params: { body: AtomSubjectBody }): Promise<void>;
	/** `rows` is the org's whole shared catalog, read from Autumn at `readAt` (epoch ms); the Atom replaces what it held. */
	setCatalog(params: { rows: CatalogRow[]; readAt: number }): Promise<void>;
};

/** Each org has its own Atom, so a client is made per connection. */
export type GetAtomClient = (params: {
	connection: AtomConnection;
}) => AtomClient;
