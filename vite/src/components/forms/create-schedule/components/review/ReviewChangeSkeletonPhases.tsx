import { Skeleton } from "@autumn/ui";
import {
	PLAN_SECTION_HEADER_CLASS,
	PlanSection,
} from "@/components/forms/customer-state/components/tray/PlanSection";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

const NAME_WIDTHS = ["w-2/5", "w-1/2", "w-1/3", "w-[45%]"];
const PRICE_WIDTHS = ["w-16", "w-12", "w-14", "w-16"];

const pickWidth = ({ widths, index }: { widths: string[]; index: number }) =>
	widths[index % widths.length];

/** Phase blocks shaped like the form's phases, held until the first preview resolves. */
export function ReviewChangeSkeletonPhases({
	rowCounts,
}: {
	rowCounts: number[];
}) {
	return (
		<div className="flex flex-col gap-4">
			{rowCounts.map((rowCount, phaseIndex) => (
				<PlanSection
					key={phaseIndex}
					header={
						<div className={PLAN_SECTION_HEADER_CLASS}>
							<Skeleton className="h-3.5 w-24 rounded-sm" />
						</div>
					}
				>
					{Array.from({ length: rowCount }, (_, rowIndex) => (
						<div
							key={rowIndex}
							className={cn(
								"flex min-h-11 items-center gap-3 px-3",
								TABLE_TRAY_SURFACE_DIVIDER_CLASS,
							)}
						>
							<span className="flex min-w-0 flex-1">
								<Skeleton
									className={cn(
										"h-3.5 rounded-sm",
										pickWidth({ widths: NAME_WIDTHS, index: rowIndex }),
									)}
								/>
							</span>
							<Skeleton
								className={cn(
									"h-3.5 shrink-0 rounded-sm",
									pickWidth({ widths: PRICE_WIDTHS, index: rowIndex }),
								)}
							/>
						</div>
					))}
				</PlanSection>
			))}
		</div>
	);
}
