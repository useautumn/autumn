import { type CheckResponseV3, stripInternalFields } from "@autumn/shared";

/** The body the API sends: it drops the fields it keeps for itself, and so does Atom, by the same list. */
export const checkResponseToJson = ({
	response,
}: {
	response: CheckResponseV3;
}): string => JSON.stringify(stripInternalFields({ data: response }));
