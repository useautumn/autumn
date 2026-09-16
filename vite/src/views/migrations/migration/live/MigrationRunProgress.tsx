import { UsersIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { migrationProgress } from "./migrationProgress";

const EASE_OUT = [0.32, 0.72, 0, 1] as const;
const ENTER_TRANSITION = { duration: 0.3, ease: EASE_OUT };
/** Held back so the bar visibly completes before the footer collapses. */
const EXIT_TRANSITION = { duration: 0.25, ease: EASE_OUT, delay: 0.55 };
const FILL_TRANSITION = { duration: 0.45, ease: EASE_OUT };

/** Pinned to the page's footer slot while a run is active, mirroring the
 * customer export sheet. Renders inline when no slot is mounted. */
export function MigrationRunProgress({
	completed,
	running,
	total,
	expected,
	label,
	active,
	waiting = false,
	slot,
}: {
	completed: number;
	running: number;
	total: number;
	expected: number | null;
	label: string;
	active: boolean;
	/** Pulses the bar while the run is queued behind another migration. */
	waiting?: boolean;
	slot?: HTMLElement | null;
}) {
	const shouldReduceMotion = useReducedMotion();
	const { percent, denominator } = migrationProgress({
		completed,
		total,
		expected,
	});

	const footer = (
		<AnimatePresence initial={false}>
			{active && (
				<motion.output
					key="migration-progress"
					className="block overflow-hidden border-t bg-background"
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					exit={{
						opacity: 0,
						height: 0,
						transition: shouldReduceMotion ? { duration: 0 } : EXIT_TRANSITION,
					}}
					transition={shouldReduceMotion ? { duration: 0 } : ENTER_TRANSITION}
				>
					<div className="mx-auto flex w-full max-w-5xl flex-col gap-1.5 px-4 pt-3 pb-4 sm:px-10">
						<div className="flex items-center justify-between gap-3 text-xs">
							<span className="flex items-center gap-2 text-foreground">
								<UsersIcon
									size={14}
									weight="fill"
									className="text-tertiary-foreground"
								/>
								{label}
							</span>
							<span className="flex items-center gap-3 text-tertiary-foreground tabular-nums">
								{running > 0 && (
									<span className="flex items-center gap-1.5">
										<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
										{running.toLocaleString()} running
									</span>
								)}
								<span>
									<span className="font-medium text-foreground">
										{completed.toLocaleString()}
									</span>{" "}
									of{" "}
									<span className="font-medium text-foreground">
										{denominator.toLocaleString()}
									</span>{" "}
									customers
								</span>
							</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
							<motion.div
								className={cn(
									"h-full rounded-full bg-primary",
									waiting && "animate-pulse bg-primary/40",
								)}
								initial={false}
								animate={{ width: waiting ? "100%" : `${percent}%` }}
								exit={{
									width: "100%",
									transition: shouldReduceMotion
										? { duration: 0 }
										: FILL_TRANSITION,
								}}
								transition={
									shouldReduceMotion ? { duration: 0 } : FILL_TRANSITION
								}
							/>
						</div>
					</div>
				</motion.output>
			)}
		</AnimatePresence>
	);

	return slot ? createPortal(footer, slot) : footer;
}
