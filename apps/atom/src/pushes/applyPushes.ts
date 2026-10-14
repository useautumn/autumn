import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { catalogBodyToSharedRows } from "../lib/contracts/catalogContract.js";
import type { Replication } from "../replication/types/replication.js";
import type { ReplicationHandler } from "../replication/types/replicationHandler.js";
import type { Slots } from "../slots/types/slots.js";

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
const subjectKeyOf = ({
	customerId,
	body,
}: {
	customerId: string;
	body: string;
}): string => {
	const parsed = JSON.parse(body) as {
		state?: { identity?: { entityId?: string | null } };
	};
	return `${customerId}\u0000${parsed.state?.identity?.entityId ?? ""}`;
};

const CATALOG_KEY = "catalog";

export type PushReplication = { replication: Replication; relayed?: boolean };

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
	if (stored && !relayed)
		replication.replicate({
			kind: SUBJECT_PUSH.kind,
			key: subjectKeyOf({ customerId, body }),
			body,
			atomId: slots.atomId,
			headers: { [ATOM_CUSTOMER_ID_HEADER]: customerId },
		});
	return stored;
};

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
