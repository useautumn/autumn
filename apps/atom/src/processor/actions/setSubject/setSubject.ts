import type { StoredSubject } from "../../../state/types/storedSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

/** Takes in a subject as Autumn sent it; the next check reads it. */
export const setSubject = ({
	ctx,
	subject,
}: {
	ctx: SlotProcessorContext;
	subject: StoredSubject;
}): void => {
	ctx.sqliteStore.setSubject({ subject });
};
