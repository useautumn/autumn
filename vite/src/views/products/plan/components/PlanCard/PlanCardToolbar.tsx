import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useIsEditingPlan } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { DeletePlanDialog } from "../DeletePlanDialog";

interface PlanCardToolbarProps {
	onEdit?: () => void;
	onDeleteSuccess?: () => Promise<void>;
	editDisabled?: boolean;
	deleteDisabled?: boolean;
	deleteTooltip?: string;
}

export const PlanCardToolbar = ({
	onEdit,
	onDeleteSuccess,
	editDisabled,
	deleteDisabled,
	deleteTooltip,
}: PlanCardToolbarProps) => {
	const product = useProductStore((s) => s.product);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const isEditingPlan = useIsEditingPlan();

	return (
		<>
			{product?.id && (
				<CopyButton
					text={product?.id ? product?.id : ""}
					className="text-xs"
					size="sm"
				/>
			)}
			<DeletePlanDialog
				open={deleteOpen}
				setOpen={setDeleteOpen}
				onDeleteSuccess={onDeleteSuccess}
			/>
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
