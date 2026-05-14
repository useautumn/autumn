import type { PlanItemFilter } from "../../../filters/planItemFilter.js";
import type { IRNode } from "../../ir/irTypes.js";
import { parseLeaf } from "../fields/parseLeaf.js";
import { parsePriceExistence } from "../fields/parsePriceExistence.js";
import { parseRolloverExistence } from "../fields/parseRolloverExistence.js";
import { wrapAnd } from "../helpers/wrapAnd.js";
import type { ResolutionContext } from "../resolutionContext.js";

export function parsePlanItemFilter({
	filter,
	ctx,
}: {
	filter: PlanItemFilter;
	ctx: ResolutionContext;
}): IRNode {
	const children: IRNode[] = [];

	if (filter.feature_id !== undefined)
		children.push(
			parseLeaf({ field: "feature_id", rawValue: filter.feature_id, ctx }),
		);

	if (filter.price !== undefined)
		children.push(parsePriceExistence(filter.price));

	if (filter.rollover !== undefined)
		children.push(parseRolloverExistence(filter.rollover));

	// `unlimited` deferred to phase 2.
	if (filter.unlimited !== undefined)
		throw new Error("plan.item.unlimited is not supported in phase 1");

	return wrapAnd(children);
}
