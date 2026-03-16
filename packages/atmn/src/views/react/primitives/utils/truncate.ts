/**
 * Truncate a string to a maximum length with ellipsis.
 *
 * @param str - The string to truncate (or null/undefined)
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated string or "-" for null/undefined
 */
export function truncate(str: string | null, maxLength: number): string {
	if (!str) return "-";
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 3)}...`;
}
