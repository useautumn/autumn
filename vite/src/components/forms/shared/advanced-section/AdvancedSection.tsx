import type { Variants } from "motion/react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { STAGGER_CONTAINER } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import {
	LAYOUT_TRANSITION,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import {
	SheetAccordion,
	SheetAccordionItem,
} from "@/components/v2/sheets/SheetAccordion";

const ACCORDION_EASE = [0.32, 0.72, 0, 1] as const;

/** Stagger variant for individual rows inside the base options area. */
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
	return (
		<>
			<SheetSection withSeparator={!moreOptions}>
				<motion.div
					layout="position"
					transition={{ layout: LAYOUT_TRANSITION }}
					initial="hidden"
					animate="visible"
					variants={STAGGER_CONTAINER}
				>
					<div className="space-y-4">{children}</div>
				</motion.div>
			</SheetSection>
			{moreOptions && (
				<SheetAccordion>
					<SheetAccordionItem value="more-options" title="More Options">
						<div className="space-y-4">{moreOptions}</div>
					</SheetAccordionItem>
				</SheetAccordion>
			)}
		</>
	);
}
