import { motion } from "motion/react";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { Skeleton } from "@/components/ui/skeleton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

/** Skeleton for the pricing preview section -- mirrors LineItemsPreview layout */
export function AttachPreviewSkeleton() {
	return (
		<SheetSection title="Pricing Preview" withSeparator={false}>
			<motion.div
				className="flex flex-col gap-2"
				initial="hidden"
				animate="visible"
				variants={STAGGER_CONTAINER}
			>
				{/* Accordion trigger row */}
				<motion.div
					variants={STAGGER_ITEM}
					className="flex items-center justify-between py-1"
				>
					<Skeleton className="h-[14px] w-20 rounded-sm" />
					<Skeleton className="h-[14px] w-[14px] rounded-sm" />
				</motion.div>

				{/* Total Due Now row */}
				<motion.div
					variants={STAGGER_ITEM}
					className="flex items-center justify-between"
				>
					<Skeleton className="h-[14px] w-24 rounded-sm" />
					<Skeleton className="h-[14px] w-16 rounded-sm" />
				</motion.div>

				{/* Next Cycle row with badge placeholder */}
				<motion.div
					variants={STAGGER_ITEM}
					className="flex items-center justify-between"
				>
					<span className="flex items-center gap-2">
						<Skeleton className="h-[14px] w-20 rounded-sm" />
						<Skeleton className="h-4.5 w-16 rounded-full" />
					</span>
					<Skeleton className="h-[14px] w-16 rounded-sm" />
				</motion.div>
			</motion.div>
		</SheetSection>
	);
}

/** Skeleton for the attach footer action buttons */
export function AttachFooterSkeleton() {
	return (
		<motion.div
			className="flex flex-col gap-2 w-full"
			initial="hidden"
			animate="visible"
			variants={STAGGER_CONTAINER}
		>
			<motion.div variants={STAGGER_ITEM}>
				<Skeleton className="h-9 w-full rounded-lg" />
			</motion.div>
			<motion.div variants={STAGGER_ITEM}>
				<Skeleton className="h-9 w-full rounded-lg" />
			</motion.div>
		</motion.div>
	);
}
