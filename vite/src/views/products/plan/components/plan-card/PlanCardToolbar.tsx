import { IconButton } from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
	useIsLicenseEditor,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
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
}: PlanCardToolbarProps) => {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const { product } = useProduct();
	const { sheetType } = useSheet();
	const isEditingPlan = sheetType === "edit-plan";
	const settingsLabel = useIsLicenseEditor()
		? "License Settings"
		: "Plan Settings";
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
				<IconButton
					// icon={<PencilSimpleIcon />}
					onClick={onEdit}
					aria-label={settingsLabel}
					variant="secondary"
					disabled={editDisabled}
					iconOrientation="left"
					icon={<PencilSimpleIcon />}
					size="mini"
					className={cn(
						"hover:z-95",
						isEditingPlan && "btn-secondary-active !opacity-100 z-95",
					)}
				>
					{settingsLabel}
				</IconButton>
			</div>
		</>
	);
};
