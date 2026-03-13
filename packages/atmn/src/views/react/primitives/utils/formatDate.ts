/**
 * Format a timestamp to a human-readable date string.
 * Handles both Unix timestamps (seconds) and JS timestamps (milliseconds).
 *
 * @param timestamp - Unix timestamp in seconds or milliseconds
 * @returns Formatted date string like "Jan 15, 2025"
 */
export function formatDate(timestamp: number): string {
	// If timestamp is less than ~10 billion, it's in seconds (Unix), convert to ms
	// Otherwise it's already in milliseconds
	const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
	const date = new Date(ms);
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
