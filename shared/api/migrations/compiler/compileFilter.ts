import type { CustomerFilter } from "../filters/customerFilter.js";
import { filterToIr } from "./filterToIr/filterToIr.js";
import type { ResolutionContext } from "./filterToIr/resolutionContext.js";
import {
	type AmbientContext,
	type CompiledSql,
	irToSql,
} from "./irToSql/irToSql.js";
import { customerRegistry } from "./registry/customerRegistry.js";

/**
 * End-to-end: validated `CustomerFilter` → parameterized SQL fragment.
 *
 * `ambient` carries org/env scoping (and any other ambient values the
 * registry expects). Required because the customer registry declares
 * `org_id` / `env` predicates at every scope.
 */
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
