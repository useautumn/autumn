export function truncate(str: string | null, maxLength: number): string {
	if (!str) return "-";
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 3)}...`;
}
