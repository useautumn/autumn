import { type CheckResponseV3, stripInternalFields } from "@autumn/shared";
import { checkPhaseMs } from "./checkPhaseMs.js";

/** The body the API sends: it drops the fields it keeps for itself, and so does Atom, by the same list. */
export const checkResponseToJson = ({
	response,
}: {
	response: CheckResponseV3;
}): string => {
	const respondStartedAt = performance.now();
	const json = JSON.stringify(stripInternalFields({ data: response }));
	checkPhaseMs.respond += performance.now() - respondStartedAt;
	return json;
};
