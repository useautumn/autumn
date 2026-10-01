import { type SetPlansTextPart, textPartsToText } from "@autumn/shared";

/** A warning's plain message and its parts, built from one source so they never drift. */
export const warningText = (parts: SetPlansTextPart[]) => ({
	message: textPartsToText(parts),
	parts,
});
