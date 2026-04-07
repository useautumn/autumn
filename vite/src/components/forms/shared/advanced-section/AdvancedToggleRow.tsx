import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ConfigRow } from "../ConfigRow";
import { ACCORDION_ITEM } from "./AdvancedSection";

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
