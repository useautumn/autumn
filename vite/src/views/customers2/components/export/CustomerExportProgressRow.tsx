import type { CustomerExportProgress } from "@autumn/shared";
import { Progress } from "@autumn/ui";

const PERCENT_MAX = 100;

const progressToPercent = ({
	processed_rows,
	total_rows,
}: CustomerExportProgress) => {
	if (total_rows === 0) return PERCENT_MAX;
	return Math.round((processed_rows / total_rows) * PERCENT_MAX);
};

export function CustomerExportProgressRow({
	progress,
}: {
	progress: CustomerExportProgress;
}) {
	const percent = progressToPercent(progress);

	return (
		<div className="flex items-center gap-2">
			<Progress
				className="flex-1"
				value={percent}
				aria-label="Export progress"
			/>
			<span className="shrink-0 text-tertiary-foreground text-xs tabular-nums">
				{percent}%
			</span>
		</div>
	);
}
