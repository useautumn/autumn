import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const ENTER_TRANSITION = {
	duration: 0.18,
	ease: EASE_OUT,
	opacity: { duration: 0.12, ease: EASE_OUT },
};
const EXIT_TRANSITION = { duration: 0.14, ease: EASE_OUT };

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
