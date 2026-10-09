import { StatusChip } from "@autumn/ui";
import type { AtomMetricsRow, AtomMetricsSeries } from "./atomMetricsChartData";

/** Each series' colour and name beside its latest reading. */
export const MonitoringLegend = ({
	series,
	latest,
	formatValue,
}: {
	series: AtomMetricsSeries[];
	latest: AtomMetricsRow | undefined;
	formatValue: (value: number | null) => string;
}) => (
	<div className="flex flex-wrap items-center gap-1.5">
		{series.map(({ key, label, color }) => (
			<StatusChip key={key} className="font-normal text-tertiary-foreground">
				<span className="size-2 rounded-[2px]" style={{ background: color }} />
				{label}
				<span className="font-medium tabular-nums text-foreground">
					{formatValue(latest?.[key] ?? null)}
				</span>
			</StatusChip>
		))}
	</div>
);
