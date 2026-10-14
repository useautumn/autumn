import { type SetPlansTextPart, textPartsToText } from "@autumn/shared";

export const warningText = (parts: SetPlansTextPart[]) => ({
	message: textPartsToText(parts),
	parts,
});
