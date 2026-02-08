/**
 * Formats a trial duration into a human-readable string
 * @example formatTrialDuration({ duration_type: "day", duration_length: 14 }) // "14 days"
 * @example formatTrialDuration({ duration_type: "month", duration_length: 1 }) // "1 month"
 */
export function formatTrialDuration({
	duration_type,
	duration_length,
}: {
	duration_type: "day" | "month" | "year";
	duration_length: number;
}): string {
	const unit = duration_length === 1 ? duration_type : `${duration_type}s`;
	return `${duration_length} ${unit}`;
}
