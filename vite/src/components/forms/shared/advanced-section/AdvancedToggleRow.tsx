import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ACCORDION_ITEM } from "./AdvancedSection";

/** A standard toggle row inside an AdvancedSection accordion. */
export function AdvancedToggleRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<motion.div variants={ACCORDION_ITEM}>
			<div className="flex items-center justify-between px-3 h-10 rounded-xl input-base">
				<span className="text-sm text-t2">{label}</span>
				<div className="flex">{children}</div>
			</div>
		</motion.div>
	);
}
