import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { cn } from "@/lib/utils";
import { useProductQuery } from "@/views/products/product/hooks/useProductQuery";
import { useProductContext } from "@/views/products/product/ProductContext";
import { DeletePlanDialog } from "../DeletePlanDialog";

interface PlanCardToolbarProps {
	onEdit?: () => void;
	onDelete?: () => void;
	editDisabled?: boolean;
	deleteDisabled?: boolean;
	deleteTooltip?: string;
}

export const PlanCardToolbar = ({
	onEdit,
	editDisabled,
	deleteDisabled,
	deleteTooltip,
}: PlanCardToolbarProps) => {
	const { product } = useProductQuery();
	const { editingState } = useProductContext();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const isEditingPlan = editingState.type === "plan";

	return (
		<>
			<DeletePlanDialog open={deleteOpen} setOpen={setDeleteOpen} />
			<div className="flex flex-row items-center gap-1">
				<IconButton
					icon={<PencilSimpleIcon />}
					onClick={onEdit}
					aria-label="Edit plan"
					variant="muted"
					disabled={editDisabled}
					iconOrientation="center"
					className={cn(isEditingPlan && "btn-secondary-active !opacity-100 ")}
				/>

				{product?.archived ? (
					<Button variant="muted" onClick={() => setDeleteOpen(true)} size="sm">
						Archived
					</Button>
				) : (
					<IconButton
						icon={<TrashIcon />}
						onClick={() => setDeleteOpen(true)}
						aria-label="Delete plan"
						variant="muted"
						iconOrientation="center"
						disabled={deleteDisabled}
						title={deleteDisabled && deleteTooltip ? deleteTooltip : undefined}
						className={cn(deleteDisabled && "opacity-50 cursor-not-allowed")}
					/>
				)}
			</div>
		</>
	);
};
