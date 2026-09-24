/** SQL for the two string matchers, each returning its own bound params so
 * the caller never threads a mutable array through the branch. */
export type StringMatchSql = { sql: string; params: string[] };

const asPattern = ({
	op,
	field,
	value,
}: {
	op: string;
	field: string;
	value: unknown;
}): string => {
	if (typeof value !== "string")
		throw new Error(`$${op} expects a string on field "${field}"`);
	return value;
};

/** Smallest string greater than every value starting with `prefix`: bump the
 * last character that can be bumped. Null when every character is already the
 * maximum code point, leaving the range open-ended. */
const prefixUpperBound = (prefix: string): string | null => {
	const chars = Array.from(prefix);
	for (let index = chars.length - 1; index >= 0; index--) {
		const code = chars[index].codePointAt(0) ?? 0;
		if (code < 0x10ffff)
			return chars.slice(0, index).join("") + String.fromCodePoint(code + 1);
	}
	return null;
};

/**
 * A prefix match as a range rather than LIKE, which cannot use a btree index
 * under a non-C collation. The uncollated bounds drive the index seek; the
 * C-collated pair is the exact prefix test, because en_US sorts 'aB' and
 * 'a-bz' inside ['ab','ac') without carrying the prefix.
 */
export const startsWithSql = ({
	column,
	field,
	value,
}: {
	column: string;
	field: string;
	value: unknown;
}): StringMatchSql => {
	const prefix = asPattern({ op: "startsWith", field, value });
	if (prefix === "") return { sql: "TRUE", params: [] };

	const byteColumn = `${column} COLLATE "C"`;
	const upperBound = prefixUpperBound(prefix);
	if (upperBound === null)
		return {
			sql: `(${column} >= ? AND ${byteColumn} >= ?)`,
			params: [prefix, prefix],
		};

	return {
		sql: `(${column} >= ? AND ${column} < ? AND ${byteColumn} >= ? AND ${byteColumn} < ?)`,
		params: [prefix, upperBound, prefix, upperBound],
	};
};

/** Rejects an invalid pattern here rather than letting Postgres raise it
 * mid-preview or mid-run. */
export const regexSql = ({
	column,
	field,
	value,
}: {
	column: string;
	field: string;
	value: unknown;
}): StringMatchSql => {
	const pattern = asPattern({ op: "regex", field, value });
	try {
		new RegExp(pattern);
	} catch {
		throw new Error(
			`$regex on field "${field}" is not a valid regular expression`,
		);
	}
	return { sql: `${column} ~ ?`, params: [pattern] };
};
