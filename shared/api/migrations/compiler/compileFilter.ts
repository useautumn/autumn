import type { CustomerFilter } from "../filters/customerFilter.js";
import { filterToIr } from "./filterToIr/filterToIr.js";
import type { ResolutionContext } from "./filterToIr/resolutionContext.js";
import {
	type AmbientContext,
	type CompiledSql,
	irToSql,
} from "./irToSql/irToSql.js";
import { customerRegistry } from "./registry/customerRegistry.js";

export function compileFilter({
	filter,
	ctx,
	ambient,
}: {
	filter: CustomerFilter;
	ctx: ResolutionContext;
	ambient: AmbientContext;
}): CompiledSql {
	const ir = filterToIr({ filter, ctx });
	return irToSql({ ir, root: customerRegistry, ambient });
}
