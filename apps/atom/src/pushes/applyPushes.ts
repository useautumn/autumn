import { catalogBodyToSharedRows } from "../lib/contracts/catalogContract.js";
import { subjectBodyToStoredSubject } from "../lib/contracts/subjectContract.js";
import type { Slots } from "../slots/types/slots.js";

/** A subject as Autumn pushes it, over HTTP or as a command; false when an older read was ignored. */
export const applySubjectPush = ({
	slots,
	body,
}: {
	slots: Slots;
	body: unknown;
}): Promise<boolean> => {
	const subject = subjectBodyToStoredSubject({ body });
	const { customerId } = subject.state.identity;
	return slots.processorFor({ customerId }).setSubject({ subject });
};

/** The shared catalog as Autumn pushes it; false when an older read was ignored. */
export const applyCatalogPush = ({
	slots,
	body,
}: {
	slots: Slots;
	body: unknown;
}): Promise<boolean> => slots.setCatalog(catalogBodyToSharedRows({ body }));
