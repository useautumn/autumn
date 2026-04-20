import { CalendarBlankIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useHasSchedule } from "../hooks/useHasSchedule";

export function ScheduledPlanGuard({ children }: { children: ReactNode }) {
	const hasSchedule = useHasSchedule();
	const { setSheet } = useSheetStore();

	if (!hasSchedule) return <>{children}</>;

	return (
		<motion.div
			className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center"
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
		>
			<div className="space-y-1">
				<p className="text-sm font-medium text-t1">Managed by a schedule</p>
				<p className="text-xs text-t3 leading-relaxed">
					Updates to this plan must be made through the active schedule.
				</p>
			</div>
			<Button
				variant="secondary"
				size="sm"
				onClick={() => setSheet({ type: "create-schedule" })}
				className="gap-1.5"
			>
				<CalendarBlankIcon className="size-3.5" />
				Open Schedule
			</Button>
		</motion.div>
	);
}
