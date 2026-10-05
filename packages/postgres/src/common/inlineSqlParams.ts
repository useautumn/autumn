import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

const INT4_MAX = 2 ** 31 - 1;

/** A literal typed as Bun.sql would bind the value, or null when Bun's binding has no faithful literal. */
const literalOf = (value: unknown): string | null => {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "bigint") return `'${value}'::int8`;
	if (typeof value === "number") {
		if (Number.isInteger(value) && Math.abs(value) <= INT4_MAX)
			return `'${value}'::int4`;
		if (Number.isSafeInteger(value)) return `'${value}'::int8`;
		return `'${value}'::float8`;
	}
	// Bun binds a string untyped, so Postgres infers its type from where it lands, as it does for a quoted literal.
	if (typeof value === "string" && !value.includes("\0"))
		return `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
	return null;
};

/**
 * The statement with every `$n` replaced by its literal, so it can share one simple query with a `SET LOCAL`.
 * Null when a parameter has no faithful literal; the caller then binds it as usual.
 */
export const inlineSqlParams = ({
	statement,
}: {
	statement: SQL;
}): string | null => {
	const { sql: text, params } = dialect.sqlToQuery(statement);
	const literals = params.map(literalOf);
	if (literals.some((literal) => literal === null)) return null;
	let inlined = "";
	let quote: "'" | '"' | null = null;
	for (let index = 0; index < text.length; index++) {
		const char = text[index] as string;
		if (quote) {
			inlined += char;
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === '"') quote = char;
		const placeholder =
			char === "$" ? /^\d+/.exec(text.slice(index + 1)) : null;
		if (!placeholder) {
			inlined += char;
			continue;
		}
		const literal = literals[Number(placeholder[0]) - 1];
		if (literal === undefined) return null;
		inlined += literal;
		index += placeholder[0].length;
	}
	return inlined;
};
