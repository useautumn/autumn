import { CaretDownIcon } from "@phosphor-icons/react";
import type { Transition, Variants } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import {
	LAYOUT_TRANSITION,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";

const ACCORDION_EASE = [0.32, 0.72, 0, 1] as const;

const ACCORDION_EXPAND: Transition = {
	duration: 0.35,
	ease: ACCORDION_EASE,
};

const ACCORDION_COLLAPSE: Transition = {
	duration: 0.25,
	ease: ACCORDION_EASE,
	delay: 0.1,
};

const ACCORDION_CONTENT: Variants = {
	hidden: {
		transition: { staggerChildren: 0.04, staggerDirection: -1 },
	},
	visible: {
		transition: { delayChildren: 0.15, staggerChildren: 0.06 },
	},
};

/** Stagger variant for individual rows inside the accordion. Export for custom row layouts (e.g. Discounts). */
export const ACCORDION_ITEM: Variants = {
	hidden: {
		opacity: 0,
		y: -4,
		transition: { duration: 0.12, ease: ACCORDION_EASE },
	},
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.25, ease: ACCORDION_EASE },
	},
};

/** Shared accordion shell for "Advanced" sections in billing sheets. */
export function AdvancedSection({
	hasCustomSettings,
	customSettingsTooltip,
	children,
}: {
	hasCustomSettings: boolean;
	customSettingsTooltip?: string;
	children: ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<SheetSection withSeparator>
			<motion.div
				layout="position"
				transition={{ layout: LAYOUT_TRANSITION }}
				initial="hidden"
				animate="visible"
				variants={STAGGER_CONTAINER}
			>
				<motion.div variants={STAGGER_ITEM}>
					<button
						type="button"
						onClick={() => setIsOpen((prev) => !prev)}
						className="flex items-center justify-between w-full cursor-pointer select-none"
					>
						<h3 className="text-sub flex items-center gap-2">
							Advanced
							<AnimatePresence>
								{hasCustomSettings && (
									<Tooltip>
										<TooltipTrigger asChild>
											<motion.span
												initial={{ opacity: 0, scale: 0 }}
												animate={{ opacity: 1, scale: 1 }}
												exit={{ opacity: 0, scale: 0 }}
												transition={{ duration: 0.15 }}
												className="size-1.5 rounded-full bg-blue-400"
											/>
										</TooltipTrigger>
										{customSettingsTooltip && (
											<TooltipContent>{customSettingsTooltip}</TooltipContent>
										)}
									</Tooltip>
								)}
							</AnimatePresence>
						</h3>
						<motion.span
							animate={{ rotate: isOpen ? 180 : 0 }}
							transition={{ duration: 0.2 }}
							className="text-t3"
						>
							<CaretDownIcon size={12} />
						</motion.span>
					</button>
				</motion.div>

				<AnimatePresence initial={false}>
					{isOpen && (
						<motion.div
							initial={{ height: 0 }}
							animate={{
								height: "auto",
								transition: { height: ACCORDION_EXPAND },
							}}
							exit={{
								height: 0,
								transition: { height: ACCORDION_COLLAPSE },
							}}
							className="overflow-hidden"
						>
							<motion.div
								className="pt-2 space-y-2"
								initial="hidden"
								animate="visible"
								exit="hidden"
								variants={ACCORDION_CONTENT}
							>
								{children}
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</SheetSection>
	);
}
