import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/v2/buttons/Button";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useIsEditingPlan } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
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
	// onDeleteSuccess,
	editDisabled,
	deleteDisabled,
	deleteTooltip,
}: PlanCardToolbarProps) => {
	const product = useProductStore((s) => s.product);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const isEditingPlan = useIsEditingPlan();
	const navigate = useNavigate();

	return (
		<>
			<DeletePlanDialog
				open={deleteOpen}
				setOpen={setDeleteOpen}
				onDeleteSuccess={async () => {
					console.log("onDeleteSuccess");
					pushPage({
						navigate,
						path: "/products",
						queryParams: {
							tab: "products",
						},
						preserveParams: true,
					});
				}}
			/>
			<div className="flex flex-row items-center gap-1">
				<Button
					// icon={<PencilSimpleIcon />}
					onClick={onEdit}
					aria-label="Edit plan"
					variant="secondary"
					disabled={editDisabled}
					// size="sm"
					className={cn(
						// "text-body",
						isEditingPlan && "btn-secondary-active !opacity-100 ",
					)}
				>
					<PencilSimpleIcon />
					Plan Settings
				</Button>
			</div>
		</>
	);
};
