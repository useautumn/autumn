import { catalogBodyToSharedRows } from "../lib/contracts/catalogContract.js";
import type { Slots } from "../slots/types/slots.js";

/**
 * A subject as Autumn pushes it, over HTTP or the queue: routed by the customer id sent beside it and handed on as text,
 * so only its owner thread parses it. False when an older read was ignored.
 */
export const applySubjectPush = ({
	slots,
	customerId,
	body,
}: {
	slots: Slots;
	customerId: string;
	body: string;
}): Promise<boolean> =>
	slots.processorFor({ customerId }).setSubject({ customerId, body });

/** The shared catalog as Autumn pushes it; false when an older read was ignored. */
export const applyCatalogPush = ({
	slots,
	body,
}: {
	slots: Slots;
	body: unknown;
}): Promise<boolean> => slots.setCatalog(catalogBodyToSharedRows({ body }));
