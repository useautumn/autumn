import { EllipsisVerticalIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { pushPage } from "@/utils/genUtils";
import { DeletePlanDialog } from "./DeletePlanDialog";

export const PlanToolbar = () => {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const navigate = useNavigate();
	return (
		<>
			<DeletePlanDialog
				open={deleteOpen}
				setOpen={setDeleteOpen}
				onDeleteSuccess={async () => {
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
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton
						icon={<EllipsisVerticalIcon />}
						size="sm"
						variant="muted"
						iconOrientation="center"
					/>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onClick={() => setDeleteOpen(true)}>
						Delete Plan
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
