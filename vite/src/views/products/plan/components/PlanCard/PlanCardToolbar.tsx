import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { cn } from "@/lib/utils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { DeletePlanDialog } from "../DeletePlanDialog";

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
	const { editingState } = useProductContext();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const isEditingPlan = editingState.type === "plan";

	return (
		<>
			<DeletePlanDialog open={deleteOpen} setOpen={setDeleteOpen} />
			<div className="flex flex-row items-center gap-1">
				<Button
					onClick={onEdit}
					aria-label="Edit plan"
					variant="muted"
					disabled={editDisabled}
					size="sm"
					className={cn(isEditingPlan && "btn-secondary-active !opacity-100 ")}
				>
					{isEditingPlan ? "Editing" : "Edit"}
				</Button>

				<IconButton
					icon={<TrashIcon />}
					onClick={() => setDeleteOpen(true)}
					aria-label="Delete plan"
					variant="muted"
					iconOrientation="center"
				/>
			</div>
		</>
	);
};
