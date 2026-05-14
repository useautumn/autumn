import type { PlanFilter } from "../filters/planFilter.js";
import { planFilterToIr } from "./filterToIr/filterToIr.js";
import type { ResolutionContext } from "./filterToIr/resolutionContext.js";
import {
	type AmbientContext,
	type CompiledSql,
	irToSql,
} from "./irToSql/irToSql.js";
import { planRegistry } from "./registry/planRegistry.js";

/**
 * End-to-end: validated `PlanFilter` → parameterized SQL fragment, rooted
 * at the catalog `products` table.
 */
export function compilePlanFilter({
	filter,
	ctx,
	ambient,
}: {
	filter: PlanFilter;
	ctx: ResolutionContext;
	ambient: AmbientContext;
}): CompiledSql {
	const ir = planFilterToIr({ filter, ctx });
	return irToSql({ ir, root: planRegistry, ambient });
}
