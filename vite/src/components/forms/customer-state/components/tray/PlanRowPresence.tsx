import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Children, isValidElement, type ReactNode } from "react";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";
import { cn } from "@/lib/utils";

const COLLAPSED = { height: 0, opacity: 0 };
const EXPANDED = { height: "auto", opacity: 1 };
const FADED = { opacity: 0 };

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
						transition={LAYOUT_TRANSITION}
						className={cn("overflow-hidden", itemClassName)}
					>
						{child}
					</motion.div>
				) : null,
			)}
		</AnimatePresence>
	);
}
