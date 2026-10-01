import { HoverCard, HoverCardContent, HoverCardTrigger } from "@autumn/ui";
import { uniq } from "lodash";
import { cn } from "@/lib/utils";
import type {
	ReviewChangePhase,
	ReviewChangeSystem,
} from "../../utils/review/types/reviewChange";

const DOT_COLOR: Record<ReviewChangeSystem, string> = {
	stripe: "border-indigo-500 bg-indigo-500",
	autumn: "border-primary bg-primary",
};

const phaseDetail = (phase: ReviewChangePhase) =>
	[
		...(phase.removed ? ["Removed"] : []),
		...uniq(phase.rows.map((row) => row.title)),
	].join(" · ");

export function ReviewPhaseTimeline({
	phases,
	system,
}: {
	phases: ReviewChangePhase[];
	system: ReviewChangeSystem;
}) {
	return (
		<HoverCard>
			<HoverCardTrigger asChild delay={400} closeDelay={100}>
				<span className="shrink-0 cursor-default rounded-full border border-border/50 bg-muted px-2 py-px text-xs font-normal text-tertiary-foreground">
					{phases.length} phases
				</span>
			</HoverCardTrigger>
			<HoverCardContent
				align="end"
				className="w-80 rounded-[10px] border-overlay-border bg-overlay px-3.5 py-3 shadow-overlay"
			>
				<ol className="flex flex-col">
					{phases.map((phase, index) => {
						const isLast = index === phases.length - 1;
						return (
							<li key={phase.key} className="flex gap-2.5">
								<span className="flex w-2 shrink-0 flex-col items-center pt-1.5">
									<span
										className={cn(
											"size-2 shrink-0 rounded-full border-[1.5px]",
											DOT_COLOR[system],
											index > 0 && "bg-transparent",
										)}
									/>
									{!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
								</span>
								<span
									className={cn("flex min-w-0 flex-col", !isLast && "pb-2.5")}
								>
									<span className="text-[13px] leading-5 font-medium text-foreground">
										{phase.label}
									</span>
									<span className="truncate text-xs leading-[18px] text-tertiary-foreground">
										{phaseDetail(phase)}
									</span>
								</span>
							</li>
						);
					})}
				</ol>
			</HoverCardContent>
		</HoverCard>
	);
}
