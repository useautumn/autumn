import type { CustomerFilter } from "../../../filters/customerFilter.js";
import type { PlanFilter } from "../../../filters/planFilter.js";
import type { IRNav } from "../../ir/irTypes.js";
import { isQuantifierWrapper } from "../helpers/isQuantifierWrapper.js";
import type { ResolutionContext } from "../resolutionContext.js";
import { parsePlanFilter } from "../scopes/parsePlanFilter.js";

export function parsePlanNav({
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
