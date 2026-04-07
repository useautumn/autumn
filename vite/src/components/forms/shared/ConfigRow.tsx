import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

const EXPAND_TRANSITION = {
	duration: 0.2,
	ease: [0.32, 0.72, 0, 1] as const,
};

/**
 * Consistent label + control row used across plan config and advanced sections.
 * Pass `expanded` to animate children in/out; omit it to render children statically.
 */
export function ConfigRow({
	title,
	description,
	action,
	children,
	expanded,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	children?: ReactNode;
	expanded?: boolean;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-3">
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="text-sm font-medium text-t1">{title}</span>
					{description && (
						<span className="text-xs text-t3">{description}</span>
					)}
				</div>
				{action && <div className="flex shrink-0">{action}</div>}
			</div>
			{expanded !== undefined ? (
				<AnimatePresence initial={false}>
					{expanded && children && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{
								height: "auto",
								opacity: 1,
								transition: {
									height: EXPAND_TRANSITION,
									opacity: { duration: 0.15, delay: 0.05 },
								},
							}}
							exit={{
								height: 0,
								opacity: 0,
								transition: {
									opacity: { duration: 0.1 },
									height: { ...EXPAND_TRANSITION, delay: 0.05 },
								},
							}}
							className="overflow-hidden"
						>
							{children}
						</motion.div>
					)}
				</AnimatePresence>
			) : (
				children
			)}
		</div>
	);
}
