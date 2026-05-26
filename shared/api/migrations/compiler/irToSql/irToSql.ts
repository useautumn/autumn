import type { IRLeaf, IRNode, Quantifier } from "../ir/irTypes.js";
import type {
	AmbientPredicate,
	FieldDef,
	NavScope,
	RootScope,
} from "../registry/registryTypes.js";

export type CompiledSql = {
	/** WHERE-clause fragment with `?` placeholders. */
	sql: string;
	/** Values to bind in placeholder order. */
	params: unknown[];
};

/** Values supplied to ambient predicates with `source.kind === "context"`. */
export type AmbientContext = Record<string, unknown>;

/**
 * Compile an IR tree into a parameterized SQL fragment. The root scope's
 * ambient predicates are emitted at the top of the WHERE clause; every
 * nested scope's ambient predicates are auto-injected into its EXISTS
 * subquery.
 */
export function irToSql({
	ir,
	root,
	ambient,
}: {
	ir: IRNode;
	root: RootScope;
	ambient: AmbientContext;
}): CompiledSql {
	const params: unknown[] = [];
	const rootAmbient = compileAmbient({
		predicates: root.ambient,
		ambient,
		params,
	});
	const irSql = compileNode({
		node: ir,
		fields: root.fields,
		params,
		ambient,
	});
	const parts = [...rootAmbient, irSql].filter((s) => s.length > 0);
	return { sql: parts.join(" AND "), params };
}

function compileAmbient({
	predicates,
	ambient,
	params,
}: {
	predicates: AmbientPredicate[] | undefined;
	ambient: AmbientContext;
	params: unknown[];
}): string[] {
	if (!predicates) return [];
	return predicates.map((pred) => {
		if (pred.source.kind === "context") {
			const value = ambient[pred.source.key];
			if (value === undefined)
				throw new Error(
					`Missing ambient value for key "${pred.source.key}" (column ${pred.column})`,
				);
			params.push(value);
			return `${pred.column} = ?`;
		}
		// values: static IN list
		if (pred.source.values.length === 0) return "FALSE";
		const placeholders = pred.source.values
			.map((v) => {
				params.push(v);
				return "?";
			})
			.join(", ");
		return `${pred.column} IN (${placeholders})`;
	});
}

function compileNode({
	node,
	fields,
	params,
	ambient,
}: {
	node: IRNode;
	fields: Record<string, FieldDef>;
	params: unknown[];
	ambient: AmbientContext;
}): string {
	if (node.kind === "leaf") return compileLeaf({ leaf: node, fields, params });
	if (node.kind === "and") {
		if (node.children.length === 0) return "TRUE";
		const parts = node.children.map((c) =>
			compileNode({ node: c, fields, params, ambient }),
		);
		return `(${parts.join(" AND ")})`;
	}
	if (node.kind === "or") {
		if (node.children.length === 0) return "FALSE";
		const parts = node.children.map((c) =>
			compileNode({ node: c, fields, params, ambient }),
		);
		return `(${parts.join(" OR ")})`;
	}
	// nav
	const def = fields[node.name];
	if (!def) throw new Error(`Unknown nav field: ${node.name}`);
	if (def.kind !== "nav") throw new Error(`Field "${node.name}" is not a nav`);
	return existsForScope({
		scope: def.scope,
		child: node.child,
		quantifier: node.quantifier,
		params,
		ambient,
	});
}

function existsForScope({
	scope,
	child,
	quantifier,
	params,
	ambient,
}: {
	scope: NavScope;
	child: IRNode;
	quantifier: Quantifier;
	params: unknown[];
	ambient: AmbientContext;
}): string {
	const ambientPreds = compileAmbient({
		predicates: scope.ambient,
		ambient,
		params,
	});
	const childSql = compileNode({
		node: child,
		fields: scope.fields,
		params,
		ambient,
	});
	const conditions = [scope.correlation, ...ambientPreds, childSql].filter(
		(s) => s.length > 0 && s !== "TRUE",
	);
	const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
	const keyword = quantifier === "none" ? "NOT EXISTS" : "EXISTS";
	return `${keyword} (SELECT 1 FROM ${scope.from} WHERE ${whereClause})`;
}

function compileLeaf({
	leaf,
	fields,
	params,
}: {
	leaf: IRLeaf;
	fields: Record<string, FieldDef>;
	params: unknown[];
}): string {
	const def = fields[leaf.field];
	if (!def) throw new Error(`Unknown leaf field: ${leaf.field}`);
	if (def.kind !== "leaf")
		throw new Error(`Field "${leaf.field}" is not a leaf`);

	const col = def.sql;

	if (leaf.op === "exists") {
		return leaf.value === true ? `${col} IS NOT NULL` : `${col} IS NULL`;
	}
	if (leaf.op === "eq") {
		if (leaf.value === null) return `${col} IS NULL`;
		params.push(leaf.value);
		return `${col} = ?`;
	}
	if (leaf.op === "ne") {
		if (leaf.value === null) return `${col} IS NOT NULL`;
		params.push(leaf.value);
		return `${col} <> ?`;
	}
	if (leaf.op === "in" || leaf.op === "nin") {
		if (!Array.isArray(leaf.value))
			throw new Error(`$${leaf.op} expects an array on field "${leaf.field}"`);
		const keyword = leaf.op === "in" ? "IN" : "NOT IN";
		if (leaf.value.length === 0) return leaf.op === "in" ? "FALSE" : "TRUE";
		const placeholders = leaf.value
			.map((v) => {
				params.push(v);
				return "?";
			})
			.join(", ");
		return `${col} ${keyword} (${placeholders})`;
	}
	if (
		leaf.op === "gt" ||
		leaf.op === "gte" ||
		leaf.op === "lt" ||
		leaf.op === "lte"
	) {
		if (leaf.value === null || Array.isArray(leaf.value))
			throw new Error(
				`$${leaf.op} requires a scalar value on field "${leaf.field}"`,
			);
		const symbol = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[leaf.op];
		params.push(leaf.value);
		return `${col} ${symbol} ?`;
	}
	throw new Error(`Unsupported op: ${(leaf as IRLeaf).op}`);
}
