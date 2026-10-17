import type { FilterMatch } from "./filterFieldTypes";

/** OR: the first item that matches decides, even after an unsupported one. */
export const matchAny = <Item>({
	items,
	match,
}: {
	items: Item[];
	match: (args: { item: Item; index: number }) => FilterMatch;
}): FilterMatch => {
	let firstUnsupported: FilterMatch | undefined;
	for (const [index, item] of items.entries()) {
		const result = match({ item, index });
		if (result.result === "match") return result;
		if (result.result === "unsupported") firstUnsupported ??= result;
	}
	return firstUnsupported ?? { result: "no_match" };
};
