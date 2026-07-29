import { Button } from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

export function PlanEditButton({ onEditPlan }: { onEditPlan: () => void }) {
	return (
		<motion.div
			layout="position"
			transition={{ layout: LAYOUT_TRANSITION }}
			className="mt-2"
		>
			<Button variant="secondary" onClick={onEditPlan} className="w-full">
				<PencilSimpleIcon size={14} className="mr-1" />
				Create Custom Plan
			</Button>
		</motion.div>
	);
}
