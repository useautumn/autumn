import { Skeleton } from "@autumn/ui";
import { format } from "date-fns";
import { useLogsVolume, type VolumeBin } from "../hooks/useLogsVolume";

const LOADING_BARS = 48;
const LOADING_AXIS_LABELS = 7;
const HOURS_PER_LABEL = 3;
const MAX_DAY_LABELS = 10;
const BAR_ROW = "flex items-end gap-1 h-12";
const AXIS_ROW = "flex gap-1 h-4 text-[11px] leading-4 text-subtle";

type BinSize = ReturnType<typeof useLogsVolume>["binSize"];

const binTitle = ({ bin, binSize }: { bin: VolumeBin; binSize: BinSize }) =>
	format(new Date(bin.period), binSize === "hour" ? "MMM d HH:mm" : "MMM d");

/** Hourly bins get a time every third hour; daily bins a date, thinned so they never overlap. */
const axisLabel = ({
	bin,
	index,
	binSize,
	dayStride,
}: {
	bin: VolumeBin;
	index: number;
	binSize: BinSize;
	dayStride: number;
}) => {
	const date = new Date(bin.period);
	if (binSize === "hour") {
		return date.getHours() % HOURS_PER_LABEL === 0
			? format(date, "HH:mm")
			: null;
	}
	return index % dayStride === 0 ? format(date, "d MMM") : null;
};

/** Event volume across the selected range, under the list's filters. */
export const LogsVolumeStrip = () => {
	const { bins, binSize, isLoading } = useLogsVolume();

	if (isLoading) {
		// Same two rows as the loaded strip, so the page doesn't shift when data lands.
		return (
			<div className="flex flex-col gap-1.5">
				<div className={BAR_ROW}>
					{Array.from({ length: LOADING_BARS }, (_, i) => (
						<Skeleton key={i} className="flex-1 h-3 rounded-[1px]" />
					))}
				</div>
				<div className="flex justify-between h-4">
					{Array.from({ length: LOADING_AXIS_LABELS }, (_, i) => (
						<Skeleton key={i} className="h-2.5 w-16 rounded-sm" />
					))}
				</div>
			</div>
		);
	}

	const peak = Math.max(...bins.map((bin) => bin.total), 1);
	const dayStride = Math.ceil(bins.length / MAX_DAY_LABELS);

	return (
		<div className="flex flex-col gap-1.5">
			<div className={BAR_ROW}>
				{bins.map((bin) => (
					<div
						key={bin.period}
						className="flex flex-1 items-end h-full"
						title={`${binTitle({ bin, binSize })} · ${bin.total.toLocaleString()} events`}
					>
						<div
							className="w-full min-h-px rounded-t-[2px] bg-[var(--chart-series-1)]"
							style={{ height: `${(bin.total / peak) * 100}%` }}
						/>
					</div>
				))}
			</div>
			<div className={AXIS_ROW}>
				{bins.map((bin, index) => (
					<span
						key={bin.period}
						className="flex min-w-0 flex-1 justify-center whitespace-nowrap"
					>
						{axisLabel({ bin, index, binSize, dayStride })}
					</span>
				))}
			</div>
		</div>
	);
};
