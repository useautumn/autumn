import { Skeleton } from "@autumn/ui";
import { format } from "date-fns";
import { useLogsVolume, type VolumeBin } from "../hooks/useLogsVolume";

const LOADING_BARS = 48;
const AXIS_LABELS = 7;
const AXIS_ROW =
	"flex justify-between items-center h-4 font-mono text-[11px] leading-4 text-subtle";

const binLabel = ({ bin, binSize }: { bin: VolumeBin; binSize: string }) =>
	format(new Date(bin.period), binSize === "hour" ? "MMM d HH:mm" : "MMM d");

/** Evenly spaced bins to label under the strip, first and last included. */
const labelledBins = ({ bins }: { bins: VolumeBin[] }) => {
	if (bins.length <= AXIS_LABELS) return bins;
	const step = (bins.length - 1) / (AXIS_LABELS - 1);
	return Array.from(
		{ length: AXIS_LABELS },
		(_, i) => bins[Math.round(i * step)],
	);
};

/** Event volume across the selected range, under the list's filters. */
export const LogsVolumeStrip = () => {
	const { bins, binSize, isLoading } = useLogsVolume();

	if (isLoading) {
		// Same two rows as the loaded strip, so the page doesn't shift when data lands.
		return (
			<div className="flex flex-col gap-1.5">
				<div className="flex items-end gap-[3px] h-10">
					{Array.from({ length: LOADING_BARS }, (_, i) => (
						<Skeleton key={i} className="flex-1 h-3 rounded-[1px]" />
					))}
				</div>
				<div className={AXIS_ROW}>
					{Array.from({ length: AXIS_LABELS }, (_, i) => (
						<Skeleton key={i} className="h-2.5 w-16 rounded-sm" />
					))}
				</div>
			</div>
		);
	}

	const peak = Math.max(...bins.map((bin) => bin.total), 1);

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-end gap-[3px] h-10">
				{bins.map((bin) => (
					// Each bin keeps its full-width slot (and hover target); only the bar is thin.
					<div
						key={bin.period}
						className="group flex flex-1 justify-center items-end h-full"
						title={`${binLabel({ bin, binSize })} · ${bin.total.toLocaleString()} events`}
					>
						<div
							className="w-full max-w-1.5 min-h-px rounded-t-[1px] bg-[var(--chart-series-1)] opacity-80 group-hover:opacity-100"
							style={{ height: `${(bin.total / peak) * 100}%` }}
						/>
					</div>
				))}
			</div>
			<div className={AXIS_ROW}>
				{labelledBins({ bins }).map((bin) => (
					<span key={bin.period}>{binLabel({ bin, binSize })}</span>
				))}
			</div>
		</div>
	);
};
