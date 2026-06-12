import type { CustomerFilter } from "../../../filters/customerFilter.js";
import type { IRNode } from "../../ir/irTypes.js";
import { parseLeaf } from "../fields/parseLeaf.js";
import { wrapAnd } from "../helpers/wrapAnd.js";
import { parseItemNav } from "../navs/parseItemNav.js";
import { parsePlanNav } from "../navs/parsePlanNav.js";
import type { ResolutionContext } from "../resolutionContext.js";

export function parseCustomerFilter({
	filter,
	ctx,
}: {
	filter: CustomerFilter;
	ctx: ResolutionContext;
}): IRNode {
	const children: IRNode[] = [];

	if (filter.customer_id !== undefined)
		children.push(
			parseLeaf({ field: "customer_id", rawValue: filter.customer_id, ctx }),
		);
	if (filter.plan !== undefined)
		children.push(parsePlanNav({ raw: filter.plan, ctx }));
	// `item` is sugar for `plan: { item: ... }` — wraps the item nav in a
	// plan nav so the IR stays canonical (no separate scope/registry entry).
	if (filter.item !== undefined)
		children.push({
			kind: "nav",
			name: "plan",
			quantifier: "some",
			child: parseItemNav({ raw: filter.item, ctx }),
		});

	if (filter.$and !== undefined) {
		for (const branch of filter.$and)
			children.push(parseCustomerFilter({ filter: branch, ctx }));
	}

	if (filter.$or !== undefined) {
		if (filter.$or.length === 0)
			throw new Error("$or requires at least one branch");
		children.push({
			kind: "or",
			children: filter.$or.map((branch) =>
				parseCustomerFilter({ filter: branch, ctx }),
			),
		});
	}

	return wrapAnd(children);
}
