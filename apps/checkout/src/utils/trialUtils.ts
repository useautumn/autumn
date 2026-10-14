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
