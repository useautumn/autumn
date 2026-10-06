import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

/** pg binds a scalar as untyped text, so Postgres infers its type from where it lands, as it does for a quoted literal. */
const literalOf = (value: unknown): string | null => {
	if (value === null || value === undefined) return "NULL";
	if (!["string", "number", "bigint", "boolean"].includes(typeof value))
		return null;
	const text = String(value);
	if (text.includes("\0")) return null;
	return `E'${text.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
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
