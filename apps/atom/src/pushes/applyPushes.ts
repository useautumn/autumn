import { catalogBodyToSharedRows } from "../lib/contracts/catalogContract.js";
import type { PeerRelay } from "../peers/types/peerRelay.js";
import type { Slots } from "../slots/types/slots.js";

/**
 * A subject as Autumn pushes it, over HTTP or the queue: routed by the customer id sent beside it and handed on as text,
 * so only its owner thread parses it. False when an older read was ignored. With `peers`, passed on to the other replicas.
 */
export const applySubjectPush = async ({
	slots,
	customerId,
	body,
	peers,
}: {
	slots: Slots;
	customerId: string;
	body: string;
	peers?: PeerRelay;
}): Promise<boolean> => {
	const stored = await slots
		.processorFor({ customerId })
		.setSubject({ customerId, body });
	// Passed on even when older here: a peer that missed the newer copy still needs this one.
	peers?.relay({ kind: "subjects.set", customerId, body });
	return stored;
};

/** The shared catalog as Autumn pushes it; false when an older read was ignored. */
export const applyCatalogPush = async ({
	slots,
	body,
	text,
	peers,
}: {
	slots: Slots;
	body: unknown;
	text: string;
	peers?: PeerRelay;
}): Promise<boolean> => {
	const stored = await slots.setCatalog(catalogBodyToSharedRows({ body }));
	peers?.relay({ kind: "catalog.set", body: text });
	return stored;
};
