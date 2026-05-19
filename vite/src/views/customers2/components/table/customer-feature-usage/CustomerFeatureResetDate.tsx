import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";

interface CustomerFeatureResetDateProps {
	resetTimestamp: number | null | undefined;
}

export function CustomerFeatureResetDate({
	resetTimestamp,
}: CustomerFeatureResetDateProps) {
	if (!resetTimestamp) {
		return <div className="text-xs text-tertiary-foreground">-</div>;
	}

	const { date, time } = formatUnixToDateTime(resetTimestamp);

	return (
		<div className="text-xs text-tertiary-foreground">
			{date} {time}
		</div>
	);
}
