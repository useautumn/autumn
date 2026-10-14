import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import { ChartSkeleton } from "./ChartSkeleton";
import { SlowLoadNotice } from "./SlowLoadNotice";

const SLOW_AFTER_SECONDS = 5;

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
			{isSlow && <SlowLoadNotice seconds={seconds} />}
		</div>
	);
};
