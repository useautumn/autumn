import type { CustomerFilter } from "../../filters/customerFilter.js";
import type { PlanFilter } from "../../filters/planFilter.js";
import type { IRNode } from "../ir/irTypes.js";
import type { ResolutionContext } from "./resolutionContext.js";
import { parseCustomerFilter } from "./scopes/parseCustomerFilter.js";
import { parsePlanFilter } from "./scopes/parsePlanFilter.js";

export function filterToIr({
	filter,
	ctx,
}: {
	filter: CustomerFilter;
	ctx: ResolutionContext;
}): IRNode {
	return parseCustomerFilter({ filter, ctx });
}

export function planFilterToIr({
	filter,
	ctx,
}: {
	filter: PlanFilter;
	ctx: ResolutionContext;
}): IRNode {
	return parsePlanFilter({ filter, ctx });
}
