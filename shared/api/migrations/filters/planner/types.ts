import type { CompiledSql } from "../../compiler/irToSql/irToSql.js";

export type CustomerAccessPathId = "plan.plan_id";

export type CustomerCandidateQuery = {
	source: CompiledSql;
	where: CompiledSql;
	accessPath:
		| { kind: "fallback" }
		| { kind: "planned"; id: CustomerAccessPathId; consumed: boolean };
};

export type CustomerAccessPath<TConstraint> = {
	id: CustomerAccessPathId;
	buildSource: (args: {
		constraint: TConstraint;
		ambient: Record<string, unknown>;
	}) => CompiledSql;
};
