import { PencilSimpleIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { STAGGER_ITEM_LAYOUT } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { Button } from "@/components/v2/buttons/Button";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

export function PlanEditButton({
	onEditPlan,
	useStagger,
}: {
	onEditPlan: () => void;
	useStagger?: boolean;
}) {
	return (
		<motion.div
			layout="position"
			transition={{ layout: LAYOUT_TRANSITION }}
			variants={useStagger ? STAGGER_ITEM_LAYOUT : undefined}
		>
			<Button variant="secondary" onClick={onEditPlan} className="w-full">
				<PencilSimpleIcon size={14} className="mr-1" />
				Edit Plan Items
			</Button>
		</motion.div>
	);
}
