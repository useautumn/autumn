import { PencilIcon, Trash2 } from "lucide-react";
import { HoverClickableIcon } from "@/components/v2/buttons/HoverClickableIcon";

interface PlanCardToolbarProps {
	onEdit?: () => void;
	onDelete?: () => void;
	editDisabled?: boolean;
}

export const PlanCardToolbar = ({
	onEdit,
	onDelete,
	editDisabled,
}: PlanCardToolbarProps) => {
	return (
		<div className="flex flex-row items-center gap-2">
			{/* Edit button */}
			<HoverClickableIcon
				icon={<PencilIcon size={16} />}
				onClick={onEdit}
				disabled={editDisabled}
				aria-label="Edit plan"
			/>

			{/* Delete button */}
			<HoverClickableIcon
				icon={<Trash2 size={16} />}
				onClick={onDelete}
				aria-label="Delete plan"
			/>
		</div>
	);
};
