import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { catalogBodyToSharedRows } from "../lib/contracts/catalogContract.js";
import type { Replication } from "../replication/types/replication.js";
import type { ReplicationHandler } from "../replication/types/replicationHandler.js";
import type { Slots } from "../slots/types/slots.js";

/** A push is applied again wherever it lands: a store keeps the newest read per subject, so a repeat changes nothing. */
export const SUBJECT_PUSH: ReplicationHandler = {
	kind: "subjects.set",
	path: "/v1/subjects.set",
};
export const CATALOG_PUSH: ReplicationHandler = {
	kind: "catalog.set",
	path: "/v1/catalog.set",
};
/** The one catalog per folder: a newer copy replaces an older one still on its way. */
const CATALOG_KEY = "catalog";

/** How a push reaches the other replicas: not at all when it was already relayed here, or when there are none. */
export type PushReplication = { replication?: Replication; relayed?: boolean };

/**
 * A subject as Autumn pushes it, over HTTP or the queue: routed by the customer id sent beside it and handed on as text,
 * so only its owner thread parses it. False when an older read was ignored; a stored one goes on to the other replicas.
 */
export const applySubjectPush = async ({
	slots,
	customerId,
	body,
	replication,
	relayed = false,
}: {
	slots: Slots;
	customerId: string;
	body: string;
} & PushReplication): Promise<boolean> => {
	const stored = await slots
		.processorFor({ customerId })
		.setSubject({ customerId, body });
	if (stored && replication && !relayed)
		replication.replicate({
			kind: SUBJECT_PUSH.kind,
			key: customerId,
			body,
			headers: { [ATOM_CUSTOMER_ID_HEADER]: customerId },
		});
	return stored;
};

/** The shared catalog as Autumn pushes it; false when an older read was ignored. */
export const applyCatalogPush = async ({
	slots,
	body,
	replication,
	relayed = false,
}: {
	slots: Slots;
	body: string;
} & PushReplication): Promise<boolean> => {
	const stored = await slots.setCatalog(
		catalogBodyToSharedRows({ body: JSON.parse(body) }),
	);
	if (stored && replication && !relayed)
		replication.replicate({ kind: CATALOG_PUSH.kind, key: CATALOG_KEY, body });
	return stored;
};
