import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import { ChartSkeleton } from "./ChartSkeleton";
import { SlowLoadNotice } from "./SlowLoadNotice";

const SLOW_AFTER_SECONDS = 5;

/** Stubs that sweep while the load is young; past 5s the sweep stops and the slow-load card takes over. */
export const ChartLoadingStubs = ({
	binStarts,
	interval,
	seriesCount,
}: {
	binStarts: number[];
	interval: string;
	seriesCount: number;
}) => {
	const seconds = useElapsedSeconds({ active: true });
	const isSlow = seconds >= SLOW_AFTER_SECONDS;

	return (
		<div className="absolute inset-0 flex flex-col">
			<ChartSkeleton
				binStarts={binStarts}
				interval={interval}
				isSweeping={!isSlow}
				seriesCount={seriesCount}
			/>
			{/* No nested AnimatePresence: the notice exits with the stubs, under the page's presence. */}
			{isSlow && <SlowLoadNotice seconds={seconds} />}
		</div>
	);
};
