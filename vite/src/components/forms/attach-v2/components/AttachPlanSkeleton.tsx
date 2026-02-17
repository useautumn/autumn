import { TimerIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { Skeleton } from "@/components/ui/skeleton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

export function AttachPlanSkeleton() {
	return (
		<SheetSection withSeparator>
			<motion.div
				className="space-y-2"
				initial="hidden"
				animate="visible"
				variants={STAGGER_CONTAINER}
			>
				{/* Section title - static content with disabled buttons */}
				<motion.div variants={STAGGER_ITEM}>
					<h3 className="text-sub select-none w-full">
						<span className="flex items-center justify-between w-full gap-2">
							<span className="flex items-center gap-1.5">
								Plan Configuration
							</span>
							<IconButton
								icon={<TimerIcon size={14} />}
								variant="secondary"
								className="h-7 whitespace-nowrap"
								disabled
							>
								Free Trial
							</IconButton>
						</span>
					</h3>
				</motion.div>

				{/* Price display skeleton */}
				<motion.div
					variants={STAGGER_ITEM}
					className="flex gap-2 justify-between items-center"
				>
					<span className="flex items-center gap-1">
						<Skeleton className="h-5 w-10" />
						<Skeleton className="h-4 w-16" />
					</span>
				</motion.div>

				{/* Item rows skeleton */}
				{[0, 1].map((i) => (
					<motion.div key={`skeleton-row-${i}`} variants={STAGGER_ITEM}>
						<div className="flex items-center flex-1 min-w-0 h-10 px-3 rounded-xl input-base">
							<div className="flex flex-row items-center flex-1 gap-2 min-w-0">
								<div className="flex flex-row items-center gap-1 shrink-0">
									<Skeleton className="h-4 w-4 rounded" />
									<Skeleton className="h-1 w-1 rounded-full" />
									<Skeleton className="h-4 w-4 rounded" />
								</div>
								<Skeleton className="h-4 w-32" />
							</div>
						</div>
					</motion.div>
				))}

				{/* Edit button skeleton */}
				<motion.div variants={STAGGER_ITEM}>
					<Skeleton className="h-9 w-full rounded-lg" />
				</motion.div>
			</motion.div>
		</SheetSection>
	);
}
