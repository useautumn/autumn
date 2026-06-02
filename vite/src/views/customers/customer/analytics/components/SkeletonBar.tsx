import { motion, type Transition } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SkeletonBarConfig } from "../utils/chartGeometry";

type BarMode = "settled" | "breathing" | "static";

const getMode = ({
	settled,
	reducedMotion,
}: {
	settled: boolean;
	reducedMotion: boolean;
}): BarMode => {
	if (settled) {
		return "settled";
	}
	if (reducedMotion) {
		return "static";
	}
	return "breathing";
};

const getScaleY = ({
	mode,
	bar,
	targetHeight,
}: {
	mode: BarMode;
	bar: SkeletonBarConfig;
	targetHeight: number | null;
}): number | number[] => {
	if (mode === "settled") {
		return targetHeight ?? bar.peak;
	}
	if (mode === "breathing") {
		return [bar.low, bar.peak, bar.low];
	}
	return bar.peak;
};

const getTransition = ({
	mode,
	bar,
	reducedMotion,
}: {
	mode: BarMode;
	bar: SkeletonBarConfig;
	reducedMotion: boolean;
}): Transition => {
	if (mode === "breathing") {
		return {
			duration: bar.duration,
			repeat: Number.POSITIVE_INFINITY,
			ease: "easeInOut",
			delay: bar.delay,
		};
	}
	if (mode === "static") {
		return { duration: 0.3 };
	}
	return reducedMotion
		? { duration: 0.2 }
		: { type: "spring", bounce: 0.1, duration: 0.55 };
};

export const SkeletonBar = ({
	bar,
	targetHeight,
	reducedMotion,
}: {
	bar: SkeletonBarConfig;
	targetHeight: number | null;
	reducedMotion: boolean;
}) => {
	const mode = getMode({ settled: targetHeight != null, reducedMotion });
	return (
		<motion.div
			className="h-full origin-bottom"
			initial={{ scaleY: bar.low }}
			animate={{ scaleY: getScaleY({ mode, bar, targetHeight }) }}
			transition={getTransition({ mode, bar, reducedMotion })}
		>
			<Skeleton className="h-full w-full rounded-t-[2px] rounded-b-none" />
		</motion.div>
	);
};
