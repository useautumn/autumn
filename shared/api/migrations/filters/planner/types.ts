import type { CompiledSql } from "../../compiler/irToSql/irToSql.js";

export type CustomerAccessPathId = "plan.plan_id";

export type CustomerCandidateQuery = {
	/** SQL source for FROM. It must expose a `c` alias with customer columns. */
	source: CompiledSql;
	/** Final customer predicate. Planned paths keep the fallback predicate here. */
	where: CompiledSql;
	accessPath:
		| { kind: "fallback" }
		| { kind: "planned"; id: CustomerAccessPathId };
};

export type CustomerAccessPath<TConstraint> = {
	id: CustomerAccessPathId;
	buildSource: (args: {
		constraint: TConstraint;
		ambient: Record<string, unknown>;
	}) => CompiledSql;
};
