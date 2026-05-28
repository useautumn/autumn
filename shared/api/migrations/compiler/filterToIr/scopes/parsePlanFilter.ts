import type { PlanFilter } from "../../../filters/planFilter.js";
import type { IRNode } from "../../ir/irTypes.js";
import { parseLeaf } from "../fields/parseLeaf.js";
import { parsePriceExistence } from "../fields/parsePriceExistence.js";
import { wrapAnd } from "../helpers/wrapAnd.js";
import { parseItemNav } from "../navs/parseItemNav.js";
import type { ResolutionContext } from "../resolutionContext.js";

export function parsePlanFilter({
	filter,
	ctx,
}: {
	filter: PlanFilter;
	ctx: ResolutionContext;
}): IRNode {
	const children: IRNode[] = [];

	if (filter.plan_id !== undefined)
		children.push(
			parseLeaf({ field: "plan_id", rawValue: filter.plan_id, ctx }),
		);
	if (filter.version !== undefined)
		children.push(
			parseLeaf({ field: "version", rawValue: filter.version, ctx }),
		);
	if (filter.price !== undefined)
		children.push(parsePriceExistence(filter.price));
	if (filter.addon !== undefined)
		children.push(parseLeaf({ field: "addon", rawValue: filter.addon, ctx }));
	if (filter.paid !== undefined)
		children.push(parseLeaf({ field: "paid", rawValue: filter.paid, ctx }));
	if (filter.recurring !== undefined)
		children.push(
			parseLeaf({ field: "recurring", rawValue: filter.recurring, ctx }),
		);
	if (filter.custom !== undefined)
		children.push(parseLeaf({ field: "custom", rawValue: filter.custom, ctx }));
	if (filter.item !== undefined)
		children.push(parseItemNav({ raw: filter.item, ctx }));
	if (filter.$or !== undefined) {
		if (filter.$or.length === 0)
			throw new Error("$or requires at least one branch");
		const orChildren = filter.$or.map((sub) =>
			parsePlanFilter({ filter: sub, ctx }),
		);
		children.push({ kind: "or", children: orChildren });
	}

	return wrapAnd(children);
}
