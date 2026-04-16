/**
 * Escapes a string for safe use in a ClickHouse string literal (single-quoted).
 * Escapes backslashes and single quotes to prevent injection.
 */
export const escapeChString = ({ value }: { value: string }): string =>
	value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
