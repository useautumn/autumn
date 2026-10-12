import type { CatalogRow } from "@autumn/balance-engine";
import type { AtomConnection, AtomSubjectBody } from "@autumn/byoc/subjects";
import type { RetryPolicy } from "../retryWithBackoff.js";

export type {
	AtomConnection,
	AtomQueueAddress,
	AtomSubjectBody,
} from "@autumn/byoc/subjects";

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
