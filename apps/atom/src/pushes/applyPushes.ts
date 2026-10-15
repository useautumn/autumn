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
export const DELETE_PUSH: ReplicationHandler = {
	kind: "subjects.delete",
	path: "/v1/subjects.delete",
};
export const CATALOG_PUSH: ReplicationHandler = {
	kind: "catalog.set",
	path: "/v1/catalog.set",
};
/** A customer's view and each of its entities' are distinct subjects: a newer copy of one must not replace another still waiting. */
const subjectKeyOf = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string | null;
}): string => `${customerId}\u0000${entityId ?? ""}`;

/** The one catalog per folder: a newer copy replaces an older one still on its way. */
const CATALOG_KEY = "catalog";

/** How a push reaches the other replicas: not again when it was relayed here. */
export type PushReplication = { replication: Replication; relayed?: boolean };

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
	const { stored, entityId } = await slots
		.processorFor({ customerId })
		.setSubject({ customerId, body });
	if (stored && !relayed)
		replication.replicate({
			kind: SUBJECT_PUSH.kind,
			key: subjectKeyOf({ customerId, entityId }),
			body,
			atomId: slots.atomId,
			headers: { [ATOM_CUSTOMER_ID_HEADER]: customerId },
		});
	return stored;
};

/** A deletion as Autumn pushes it, applied and relayed as a subject push is; false when a newer read is already held. */
export const applyDeletePush = async ({
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
		.deleteSubject({ customerId, body });
	if (stored && !relayed) {
		const { identity } = JSON.parse(body) as {
			identity: { entityId: string | null };
		};
		replication.replicate({
			kind: DELETE_PUSH.kind,
			key: `${customerId}\u0000${identity.entityId ?? ""}`,
			body,
			atomId: slots.atomId,
			headers: { [ATOM_CUSTOMER_ID_HEADER]: customerId },
		});
	}
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
	if (stored && !relayed)
		replication.replicate({
			kind: CATALOG_PUSH.kind,
			key: CATALOG_KEY,
			body,
			atomId: slots.atomId,
		});
	return stored;
};
