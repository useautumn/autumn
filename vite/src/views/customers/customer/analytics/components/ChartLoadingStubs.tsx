import { AnimatePresence } from "motion/react";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import type { PlotInsets } from "../utils/chartGeometry";
import { ChartSkeleton } from "./ChartSkeleton";
import { SlowLoadNotice } from "./SlowLoadNotice";

const SLOW_AFTER_SECONDS = 5;

/** Stubs that sweep while the load is young; past 5s the sweep stops and the slow-load card takes over. */
export const ChartLoadingStubs = ({
	binStarts,
	interval,
	geometry,
}: {
	binStarts: number[];
	interval: string;
	geometry: PlotInsets;
}) => {
	const seconds = useElapsedSeconds({ active: true });
	const isSlow = seconds >= SLOW_AFTER_SECONDS;

	return (
		<>
			<ChartSkeleton
				binStarts={binStarts}
				interval={interval}
				isSweeping={!isSlow}
				geometry={geometry}
			/>
			<AnimatePresence>
				{isSlow && <SlowLoadNotice key="slow" seconds={seconds} />}
			</AnimatePresence>
		</>
	);
};
