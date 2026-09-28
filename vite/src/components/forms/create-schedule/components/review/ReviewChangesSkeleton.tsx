import { Skeleton } from "@autumn/ui";
import { ChevronDownIcon } from "lucide-react";
import { Fragment } from "react";
import { PlanSection } from "@/components/forms/customer-state/components/tray/PlanSection";
import { cn } from "@/lib/utils";
import type { ReviewChangeSystem } from "../../utils/review/types/reviewChange";
import { REVIEW_GROUP_HEADER_CLASS } from "./ReviewChangeGroup";
import {
	REVIEW_PHASE_HEADER_CLASS,
	REVIEW_PHASE_LIST_CLASS,
} from "./ReviewChangePhaseBlock";
import {
	REVIEW_ROW_CLASS,
	REVIEW_STATUS_COLUMN_CLASS,
	REVIEW_VALUE_COLUMN_CLASS,
} from "./ReviewChangeRowItem";
import { ReviewGroupTitle } from "./ReviewGroupTitle";
import { DEFAULT_OPEN_REVIEW_GROUP, REVIEW_GROUPS } from "./reviewGroups";

const SKELETON_TITLE_WIDTHS = ["w-36", "w-28", "w-40"];

function SkeletonGroupHeader({
	system,
	title,
	isOpen,
}: {
	system: ReviewChangeSystem;
	title: string;
	isOpen: boolean;
}) {
	return (
		<div className={cn("flex", REVIEW_GROUP_HEADER_CLASS)}>
			<ReviewGroupTitle system={system} title={title} />
			<span className="flex-1" />
			<Skeleton className="h-3 w-24" />
			<ChevronDownIcon
				className={cn(
					"size-4 shrink-0 text-muted-foreground",
					isOpen && "rotate-180",
				)}
			/>
		</div>
	);
}

function SkeletonRow({ titleWidth }: { titleWidth: string }) {
	return (
		<div className={REVIEW_ROW_CLASS}>
			<div className="min-w-0 flex-1">
				<Skeleton className={cn("h-3.5", titleWidth)} />
			</div>
			<div className={REVIEW_STATUS_COLUMN_CLASS}>
				<Skeleton className="h-[22px] w-[68px] rounded-md" />
			</div>
			<div className={REVIEW_VALUE_COLUMN_CLASS}>
				<Skeleton className="h-3.5 w-14" />
			</div>
		</div>
	);
}

/** Mirrors the loaded review: the default group open with one phase, the others collapsed. */
export function ReviewChangesSkeleton() {
	return (
		<div className="flex flex-col px-4 pt-1">
			{REVIEW_GROUPS.map((group) => {
				const isOpen = group.value === DEFAULT_OPEN_REVIEW_GROUP;
				return (
					<Fragment key={group.value}>
						<SkeletonGroupHeader
							system={group.system}
							title={group.title}
							isOpen={isOpen}
						/>
						{isOpen && (
							<div className={cn(REVIEW_PHASE_LIST_CLASS, "pb-4")}>
								<PlanSection
									header={
										<div className={REVIEW_PHASE_HEADER_CLASS}>
											<Skeleton className="h-3 w-10" />
											<Skeleton className="h-3 w-14" />
										</div>
									}
								>
									{SKELETON_TITLE_WIDTHS.map((titleWidth) => (
										<SkeletonRow key={titleWidth} titleWidth={titleWidth} />
									))}
								</PlanSection>
							</div>
						)}
					</Fragment>
				);
			})}
		</div>
	);
}
