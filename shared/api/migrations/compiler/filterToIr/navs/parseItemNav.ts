import type { PlanFilter } from "../../../filters/planFilter.js";
import type { PlanItemFilter } from "../../../filters/planItemFilter.js";
import type { IRNav } from "../../ir/irTypes.js";
import { isQuantifierWrapper } from "../helpers/isQuantifierWrapper.js";
import type { ResolutionContext } from "../resolutionContext.js";
import { parsePlanItemFilter } from "../scopes/parsePlanItemFilter.js";

export function parseItemNav({
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
