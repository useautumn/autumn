import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";

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
		<div className="flex flex-row items-center gap-1">
			{/* Edit button */}
			{/* <HoverClickableIcon
				icon={<PencilIcon size={16} />}
				onClick={onEdit}
				disabled={editDisabled}
				aria-label="Edit plan"
			/> */}
			{/* <Button variant="muted" size="sm">
				Edit
			</Button> */}
			<Button
				// icon={<PencilSimpleIcon />}
				// iconOrientation="center"
				onClick={onEdit}
				aria-label="Edit plan"
				variant="muted"
				disabled={editDisabled}
				size="sm"
			>
				Edit
			</Button>
			<IconButton
				icon={<TrashIcon />}
				onClick={onDelete}
				aria-label="Delete plan"
				variant="muted"
				iconOrientation="center"
			/>

			{/* Delete button */}
			{/* <HoverClickableIcon
				icon={<TrashIcon size={16} />}
				onClick={onDelete}
				aria-label="Delete plan"
			/> */}
		</div>
	);
};
