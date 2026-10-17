import type { ApprovalViolation } from "../types/approvalViolation";
import type { FilterMatch } from "./filterFieldTypes";

/**
 * AND: one `no_match` decides, even after an unsupported item (it can't hold
 * either way); otherwise the conditions add up.
 */
export const matchAll = <Item>({
	items,
	match,
}: {
	items: Item[];
	match: (args: { item: Item; index: number }) => FilterMatch;
}): FilterMatch => {
	const conditions: ApprovalViolation[] = [];
	let hasUnsupported = false;
	for (const [index, item] of items.entries()) {
		const result = match({ item, index });
		if (result.result === "no_match") return result;
		conditions.push(...result.conditions);
		if (result.result === "unsupported") hasUnsupported = true;
	}
	return { result: hasUnsupported ? "unsupported" : "match", conditions };
};
