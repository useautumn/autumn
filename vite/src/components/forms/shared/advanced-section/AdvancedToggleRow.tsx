import type { Variants } from "motion/react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ConfigRow } from "../ConfigRow";

const ACCORDION_EASE = [0.32, 0.72, 0, 1] as const;

const ACCORDION_ITEM: Variants = {
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

/** A standard toggle row inside an AdvancedSection accordion. */
export function AdvancedToggleRow({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<motion.div variants={ACCORDION_ITEM}>
			<ConfigRow title={label} description={description} action={children} />
		</motion.div>
	);
}
