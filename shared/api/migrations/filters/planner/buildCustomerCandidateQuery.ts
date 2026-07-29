import type { CustomerFilter } from "../customerFilter.js";
import { filterToIr } from "../../compiler/filterToIr/filterToIr.js";
import type { IRNav, IRNode } from "../../compiler/ir/irTypes.js";
import type { ResolutionContext } from "../../compiler/filterToIr/resolutionContext.js";
import {
	type AmbientContext,
	irToSql,
} from "../../compiler/irToSql/irToSql.js";
import { customerRegistry } from "../../compiler/registry/customerRegistry.js";
import { planPlanIdAccessPath } from "./accessPaths/planPlanIdAccessPath.js";
import { chooseCustomerAccessPath } from "./chooseCustomerAccessPath.js";
import type { CustomerCandidateQuery } from "./types.js";

export const withoutConsumedNav = (ir: IRNode, nav: IRNav): IRNode => {
	if (ir === nav) return { kind: "and", children: [] };
	if (ir.kind === "and")
		return { ...ir, children: ir.children.filter((child) => child !== nav) };
	return ir;
};

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
	const accessPath = chooseCustomerAccessPath(ir);

	if (accessPath?.id === "plan.plan_id") {
		const residualIr = accessPath.consumedNav
			? withoutConsumedNav(ir, accessPath.consumedNav)
			: ir;
		return {
			source: planPlanIdAccessPath.buildSource({
				constraint: accessPath.constraint,
				ambient,
			}),
			where: irToSql({ ir: residualIr, root: customerRegistry, ambient }),
			accessPath: {
				kind: "planned",
				id: accessPath.id,
				consumed: accessPath.consumedNav !== undefined,
			},
		};
	}

	return {
		source: { sql: "customers c", params: [] },
		where: irToSql({ ir, root: customerRegistry, ambient }),
		accessPath: { kind: "fallback" },
	};
};
