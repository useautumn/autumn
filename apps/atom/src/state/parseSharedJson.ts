import { deepFreeze } from "./deepFreeze.js";

/** An org's customers mostly carry the same catalog and org: each distinct text is parsed and frozen once, not per read. */
const MAX_SHARED_TEXTS = 256;

const parsedByText = new Map<string, unknown>();

/** Equal text parses to equal values, so one frozen copy serves every row that stores it. */
export const parseSharedJson = <T>(text: string): T => {
	const held = parsedByText.get(text);
	if (held !== undefined) return held as T;
	const parsed = deepFreeze(JSON.parse(text));
	if (parsedByText.size >= MAX_SHARED_TEXTS)
		parsedByText.delete(parsedByText.keys().next().value as string);
	parsedByText.set(text, parsed);
	return parsed;
};
