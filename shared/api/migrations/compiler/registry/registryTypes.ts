/**
 * Field registry — the single source of truth mapping each logical filter
 * field to its physical SQL shape. Adding a filter field = adding a
 * registry entry. Compiler stays untouched.
 *
 * Two field kinds:
 * - `leaf`: a column or expression. Used for direct comparisons.
 * - `nav`: a 1:N relation. Compiles to `EXISTS (SELECT 1 FROM <from>
 *   WHERE <correlation> AND <ambient> AND <child>)`.
 *
 * Ambient predicates: each scope can declare predicates that get
 * auto-injected when the scope is entered. Two flavors:
 * - `context` source: value pulled from an ambient context (e.g. orgId,
 *   env). Pushed as a `?` param.
 * - `values` source: static list known at registry-construction time
 *   (e.g. `cp.status IN ACTIVE_STATUSES`). Each element is pushed as a
 *   `?` param so quoting/escaping is the driver's responsibility.
 */

export type AmbientPredicate = {
	/** SQL column reference, e.g. "cp.org_id". */
	column: string;
	source:
		| { kind: "context"; key: string }
		| { kind: "values"; values: readonly (string | number)[] };
};

export type LeafField = {
	kind: "leaf";
	/** SQL expression for this field, ready to drop into a WHERE clause. */
	sql: string;
};

export type NavScope = {
	/** Source clause (without leading FROM), incl. JOINs. */
	from: string;
	/** Predicate correlating this scope to the parent scope. */
	correlation: string;
	/** Ambient predicates auto-injected on scope entry. */
	ambient?: AmbientPredicate[];
	/** Fields available in this scope. */
	fields: Record<string, FieldDef>;
};

export type NavField = {
	kind: "nav";
	scope: NavScope;
};

export type FieldDef = LeafField | NavField;

export type RootScope = {
	/** Root table aliased into the WHERE clause. */
	from: string;
	/** Ambient predicates auto-injected at the root. */
	ambient?: AmbientPredicate[];
	fields: Record<string, FieldDef>;
};
