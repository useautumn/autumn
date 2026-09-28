import {
	AnimatePresence,
	motion,
	type Transition,
	useReducedMotion,
} from "motion/react";
import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
const HEIGHT_TRANSITION: Transition = { duration: 0.22, ease: EASE_DRAWER };

const enterTransition = (delay: number): Transition => ({
	height: { ...HEIGHT_TRANSITION, delay },
	opacity: { duration: 0.18, delay: delay + 0.04, ease: "easeOut" },
});
const EXIT_TRANSITION: Transition = {
	height: HEIGHT_TRANSITION,
	opacity: { duration: 0.12, ease: "easeOut" },
};

const COLLAPSED = { height: 0, opacity: 0, transition: EXIT_TRANSITION };
const FADED = { opacity: 0, transition: EXIT_TRANSITION };

export function PlanRowPresence({
	children,
	itemClassName,
	enterDelay = 0,
}: {
	children: ReactNode;
	itemClassName?: string;
	enterDelay?: number;
}) {
	const reduceMotion = useReducedMotion();
	const hidden = reduceMotion ? FADED : COLLAPSED;
	const expanded = {
		height: "auto",
		opacity: 1,
		transition: enterTransition(enterDelay),
	};

	return (
		<AnimatePresence initial={false}>
			{Children.map(children, (child) =>
				isValidElement(child) ? (
					<motion.div
						key={child.key}
						initial={hidden}
						animate={expanded}
						exit={hidden}
						className={cn("overflow-hidden", itemClassName)}
					>
						{child}
					</motion.div>
				) : null,
			)}
		</AnimatePresence>
	);
}
