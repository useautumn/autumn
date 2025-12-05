import { AppEnv } from "@autumn/shared";
import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useOrg } from "@/hooks/common/useOrg";
import { useEnv } from "@/utils/envUtils";
import { useProductsQueryState } from "@/views/products/hooks/useProductsQueryState";
import { SyncEnvironmentDialog } from "@/views/products/sync/SyncEnvironmentDialog";

export const ProductListMenuButton = () => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [syncDialogOpen, setSyncDialogOpen] = useState(false);
	const { queryStates, setQueryStates } = useProductsQueryState();
	const { org } = useOrg();
	const env = useEnv();

	const targetEnv = env === AppEnv.Sandbox ? AppEnv.Live : AppEnv.Sandbox;
	const targetEnvName = targetEnv === AppEnv.Live ? "Production" : "Sandbox";

	// Can only sync to production if org has been deployed
	const canSyncToProduction = org?.deployed === true;
	const showSyncOption =
		targetEnv === AppEnv.Sandbox || canSyncToProduction;

	return (
		<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					icon={<EllipsisVertical />}
					variant="secondary"
					size="default"
					iconOrientation="center"
					className="!h-7"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="text-t2">
				<DropdownMenuItem
					className="flex items-center cursor-pointer"
					onClick={() => {
						setQueryStates({
							...queryStates,
							showArchivedProducts: !queryStates.showArchivedProducts,
						});
						setDropdownOpen(false);
					}}
				>
					<div className="flex items-center text-sm justify-between w-full gap-2">
						{queryStates.showArchivedProducts
							? "Show active plans"
							: "Show archived plans"}
					</div>
				</DropdownMenuItem>

				{showSyncOption && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="flex items-center cursor-pointer"
							onClick={() => {
								setSyncDialogOpen(true);
								setDropdownOpen(false);
							}}
						>
							<div className="flex items-center text-sm justify-between w-full gap-2">
								Sync to {targetEnvName}
							</div>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>

			<SyncEnvironmentDialog
				open={syncDialogOpen}
				setOpen={setSyncDialogOpen}
				from={env}
				to={targetEnv}
			/>
		</DropdownMenu>
	);
};
