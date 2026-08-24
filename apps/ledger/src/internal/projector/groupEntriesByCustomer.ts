import type {
	CustomerEntryGroup,
	DecodedEntry,
} from "./types/customerEntryGroup.js";

// A Map keeps insertion order, so groups come out in first-offset order and
// each group's entries stay in log order — the order the version guard needs.
export const groupEntriesByCustomer = ({
	decoded,
}: {
	decoded: DecodedEntry[];
}): CustomerEntryGroup[] => {
	const groups = new Map<string, CustomerEntryGroup>();

	for (const item of decoded) {
		const internalCustomerId = item.entry.internal_customer_id;
		const group = groups.get(internalCustomerId);
		if (group) {
			group.entries.push(item);
			continue;
		}
		groups.set(internalCustomerId, { internalCustomerId, entries: [item] });
	}

	return [...groups.values()];
};
