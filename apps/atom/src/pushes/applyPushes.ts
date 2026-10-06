import { catalogBodyToSharedRows } from "../lib/contracts/catalogContract.js";
import { customerIdOfSubjectPush } from "../lib/contracts/subjectContract.js";
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
	/** Null when an older Autumn sent none: then it is read from the body. */
	customerId: string | null;
	body: string;
}): Promise<boolean> => {
	const routedTo = customerId ?? customerIdOfSubjectPush({ body });
	return slots
		.processorFor({ customerId: routedTo })
		.setSubject({ customerId: routedTo, body });
};

/** The shared catalog as Autumn pushes it; false when an older read was ignored. */
export const applyCatalogPush = ({
	slots,
	body,
}: {
	slots: Slots;
	body: unknown;
}): Promise<boolean> => slots.setCatalog(catalogBodyToSharedRows({ body }));
