import type { CustomerFilter } from "../../filters/customerFilter.js";
import type { PlanFilter } from "../../filters/planFilter.js";
import type { IRNode } from "../ir/irTypes.js";
import type { ResolutionContext } from "./resolutionContext.js";
import { parseCustomerFilter } from "./scopes/parseCustomerFilter.js";
import { parsePlanFilter } from "./scopes/parsePlanFilter.js";

/**
 * Top-level entry: take a validated `CustomerFilter` plus a resolution
 * context (features, products) and produce IR ready for compilation.
 *
 * The parser walks the filter shape, recurses into each scope (customer →
 * plan → item), and converts each field-matcher pair into one or more IR
 * leaves. AND is always implicit between sibling fields. Bare nested
 * filters become `nav` nodes with implicit `$some` quantifier.
 *
 * Internal layout (each one-thing-per-file):
 *   scopes/   per-scope dispatchers (customer, plan, plan.item)
 *   navs/     scope-to-scope transitions (plan, item; routes scope variants)
 *   fields/   per-field parsers + parseLeaf + makeExistenceParser factory
 *   helpers/  wrapAnd, isQuantifierWrapper
 */
export function filterToIr({
	filter,
	ctx,
}: {
	filter: CustomerFilter;
	ctx: ResolutionContext;
}): IRNode {
	return parseCustomerFilter({ filter, ctx });
}

/**
 * Plan-rooted entry: validated `PlanFilter` → IR. Used when the migration
 * targets the catalog directly rather than a customer's plan instance.
 */
export function planFilterToIr({
	filter,
	ctx,
}: {
	filter: PlanFilter;
	ctx: ResolutionContext;
}): IRNode {
	return parsePlanFilter({ filter, ctx });
}
