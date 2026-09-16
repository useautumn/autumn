import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
	migrationProgressDenominator,
	migrationProgressPercent,
} from "./migrationProgress";

const EASE_OUT = [0.32, 0.72, 0, 1] as const;
const FILL_TRANSITION = { duration: 0.45, ease: EASE_OUT };

/** Reserved-height progress slot: the bar and its counts never change the
 * layout when a run starts, updates or finishes. */
export function MigrationRunProgress({
	completed,
	running,
	total,
	expected,
	label,
	active,
}: {
	completed: number;
	running: number;
	total: number;
	expected: number | null;
	label: string;
	active: boolean;
}) {
	const shouldReduceMotion = useReducedMotion();
	const percent = migrationProgressPercent({ completed, total, expected });
	const denominator = migrationProgressDenominator({ total, expected });
	const visible = active || completed > 0 || running > 0;

	return (
		<output
			className={cn(
				"flex h-9 w-full flex-col justify-center gap-1.5 transition-opacity",
				visible ? "opacity-100" : "opacity-0",
			)}
			aria-hidden={!visible}
		>
			<div className="flex items-center justify-between gap-2 text-xs">
				<span className="text-foreground">{label}</span>
				<span className="text-tertiary-foreground tabular-nums">
					{completed.toLocaleString()} of {denominator.toLocaleString()}
					{running > 0 && `, ${running.toLocaleString()} running`}
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<motion.div
					className="h-full rounded-full bg-primary"
					initial={false}
					animate={{ width: `${percent}%` }}
					transition={shouldReduceMotion ? { duration: 0 } : FILL_TRANSITION}
				/>
			</div>
		</output>
	);
}
