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

/** Shared section with always-visible children and an optional "More Options" accordion. */
export function AdvancedSection({
	moreOptions,
	children,
}: {
	moreOptions?: ReactNode;
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
				<div className="space-y-2">{children}</div>

				{moreOptions && (
					<>
						<motion.div variants={STAGGER_ITEM} className="pt-2">
							<button
								type="button"
								onClick={() => setIsOpen((prev) => !prev)}
								className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-t3 hover:text-t1 transition-colors"
							>
								More Options
								<motion.span
									animate={{ rotate: isOpen ? 180 : 0 }}
									transition={{ duration: 0.2 }}
								>
									<CaretDownIcon size={10} />
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
										{moreOptions}
									</motion.div>
								</motion.div>
							)}
						</AnimatePresence>
					</>
				)}
			</motion.div>
		</SheetSection>
	);
}
