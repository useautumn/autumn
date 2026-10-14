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

const prefixUpperBound = (prefix: string): string | null => {
	const chars = Array.from(prefix);
	for (let index = chars.length - 1; index >= 0; index--) {
		const code = chars[index].codePointAt(0) ?? 0;
		if (code < 0x10ffff)
			return chars.slice(0, index).join("") + String.fromCodePoint(code + 1);
	}
	return null;
};

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
