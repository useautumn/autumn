import type { CustomerFilter } from "../../filters/customerFilter.js";
import type { PlanFilter } from "../../filters/planFilter.js";
import type { PlanItemFilter } from "../../filters/planItemFilter.js";
import type { IRNav, IRNode } from "../ir/irTypes.js";
import { parseLeaf } from "./parseLeaf.js";
import type { ResolutionContext } from "./resolutionContext.js";

/**
 * Top-level entry: take a validated `CustomerFilter` plus a resolution
 * context (features, products) and produce IR ready for compilation.
 *
 * The parser walks the filter shape, recurses into each scope (customer →
 * plan → item), and converts each field-matcher pair into one or more IR
 * leaves. AND is always implicit between sibling fields. Bare nested
 * filters become `nav` nodes with implicit `$some` quantifier.
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

function parseCustomerFilter({
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

	return wrapAnd(children);
}

function parsePlanNav({
	raw,
	ctx,
}: {
	raw: NonNullable<CustomerFilter["plan"]>;
	ctx: ResolutionContext;
}): IRNav {
	// Phase 1: only $some (implicit if bare). $every / $none deferred.
	const planFilter = isQuantifierWrapper(raw) ? raw.$some : (raw as PlanFilter);
	if (!planFilter) throw new Error("plan: only $some is supported in phase 1");
	return {
		kind: "nav",
		name: "plan",
		quantifier: "some",
		child: parsePlanFilter({ filter: planFilter, ctx }),
	};
}

function parsePlanFilter({
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
	if (filter.price !== undefined)
		children.push(parsePriceExistence(filter.price));
	if (filter.paid !== undefined)
		children.push(parseLeaf({ field: "paid", rawValue: filter.paid, ctx }));
	if (filter.recurring !== undefined)
		children.push(
			parseLeaf({ field: "recurring", rawValue: filter.recurring, ctx }),
		);
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

function parseItemNav({
	raw,
	ctx,
}: {
	raw: NonNullable<PlanFilter["item"]>;
	ctx: ResolutionContext;
}): IRNav {
	const itemFilter = isQuantifierWrapper(raw)
		? raw.$some
		: (raw as PlanItemFilter);
	if (!itemFilter) throw new Error("item: only $some is supported in phase 1");
	// Route to the paid-only scope when the filter requires a non-null
	// price. Walks `customer_prices` forward instead of the entitlement
	// spine — substantially fewer rows on paid-feature migrations.
	const navName = isPaidOnlyPriceFilter(itemFilter.price)
		? "item_paid"
		: "item";
	return {
		kind: "nav",
		name: navName,
		quantifier: "some",
		child: parsePlanItemFilter({ filter: itemFilter, ctx }),
	};
}

function isPaidOnlyPriceFilter(price: PlanItemFilter["price"]): boolean {
	if (price === undefined || price === null) return false;
	if (typeof price !== "object") return false;
	const ops = price as Record<string, unknown>;
	return "$ne" in ops && ops.$ne === null;
}

function parsePlanItemFilter({
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

	// `unlimited` deferred to phase 2.
	if (filter.unlimited !== undefined)
		throw new Error("plan.item.unlimited is not supported in phase 1");

	return wrapAnd(children);
}

/**
 * Phase 1 supports only existence checks on `price` (paid vs free):
 *   price: null           → entitlement-only item (no price)
 *   price: { $eq: null }  → same
 *   price: { $ne: null }  → has a price (paid item)
 * Filtering on nested price fields (billing_method, etc.) is deferred.
 */
function parsePriceExistence(raw: unknown): IRNode {
	if (raw === null)
		return { kind: "leaf", field: "price", op: "exists", value: false };

	if (typeof raw !== "object")
		throw new Error("plan.item.price must be null or an object");

	const ops = raw as Record<string, unknown>;
	const hasOnlyNullOps =
		Object.keys(ops).every((k) => k === "$eq" || k === "$ne") &&
		Object.values(ops).every((v) => v === null || v === undefined);
	if (!hasOnlyNullOps)
		throw new Error(
			"plan.item.price filtering on nested fields is not supported in phase 1",
		);

	if ("$ne" in ops && ops.$ne === null)
		return { kind: "leaf", field: "price", op: "exists", value: true };
	if ("$eq" in ops && ops.$eq === null)
		return { kind: "leaf", field: "price", op: "exists", value: false };

	throw new Error("plan.item.price requires $eq: null or $ne: null");
}

function isQuantifierWrapper(
	raw: unknown,
): raw is { $some?: unknown; $every?: unknown; $none?: unknown } {
	if (!raw || typeof raw !== "object") return false;
	const keys = Object.keys(raw as object);
	return keys.some((k) => k === "$some" || k === "$every" || k === "$none");
}

function wrapAnd(children: IRNode[]): IRNode {
	if (children.length === 0)
		throw new Error("Empty filter scope: at least one field is required");
	if (children.length === 1) return children[0];
	return { kind: "and", children };
}
