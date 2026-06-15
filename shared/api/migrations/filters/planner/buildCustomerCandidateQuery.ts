import type { CustomerFilter } from "../customerFilter.js";
import { filterToIr } from "../../compiler/filterToIr/filterToIr.js";
import type { ResolutionContext } from "../../compiler/filterToIr/resolutionContext.js";
import {
	type AmbientContext,
	irToSql,
} from "../../compiler/irToSql/irToSql.js";
import { customerRegistry } from "../../compiler/registry/customerRegistry.js";
import { planPlanIdAccessPath } from "./accessPaths/planPlanIdAccessPath.js";
import { chooseCustomerAccessPath } from "./chooseCustomerAccessPath.js";
import type { CustomerCandidateQuery } from "./types.js";

export const buildCustomerCandidateQuery = ({
	filter,
	ctx,
	ambient,
}: {
	filter: CustomerFilter;
	ctx: ResolutionContext;
	ambient: AmbientContext;
}): CustomerCandidateQuery => {
	const ir = filterToIr({ filter, ctx });
	const fallbackWhere = irToSql({ ir, root: customerRegistry, ambient });
	const accessPath = chooseCustomerAccessPath(ir);

	if (!accessPath) {
		return {
			source: { sql: "customers c", params: [] },
			where: fallbackWhere,
			accessPath: { kind: "fallback" },
		};
	}

	if (accessPath.id === "plan.plan_id") {
		return {
			source: planPlanIdAccessPath.buildSource({
				constraint: accessPath.constraint,
				ambient,
			}),
			where: fallbackWhere,
			accessPath: { kind: "planned", id: accessPath.id },
		};
	}

	return {
		source: { sql: "customers c", params: [] },
		where: fallbackWhere,
		accessPath: { kind: "fallback" },
	};
};
