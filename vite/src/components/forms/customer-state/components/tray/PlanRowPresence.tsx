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

const ENTER_TRANSITION: Transition = {
	height: HEIGHT_TRANSITION,
	opacity: { duration: 0.18, delay: 0.04, ease: "easeOut" },
};
const EXIT_TRANSITION: Transition = {
	height: HEIGHT_TRANSITION,
	opacity: { duration: 0.12, ease: "easeOut" },
};

const COLLAPSED = { height: 0, opacity: 0, transition: EXIT_TRANSITION };
const EXPANDED = { height: "auto", opacity: 1, transition: ENTER_TRANSITION };
const FADED = { opacity: 0, transition: EXIT_TRANSITION };

export function PlanRowPresence({
	children,
	itemClassName,
}: {
	children: ReactNode;
	itemClassName?: string;
}) {
	const reduceMotion = useReducedMotion();
	const hidden = reduceMotion ? FADED : COLLAPSED;

	return (
		<AnimatePresence initial={false}>
			{Children.map(children, (child) =>
				isValidElement(child) ? (
					<motion.div
						key={child.key}
						initial={hidden}
						animate={EXPANDED}
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
