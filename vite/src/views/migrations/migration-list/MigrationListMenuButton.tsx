import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useMigrationsQueryState } from "@/views/migrations/hooks/useMigrationsQueryState";

export function MigrationListMenuButton() {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const { queryStates, setQueryStates } = useMigrationsQueryState();

	return (
		<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					icon={<EllipsisVertical />}
					variant="skeleton"
					size="default"
					iconOrientation="center"
					className="!h-7"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="text-muted-foreground">
				<DropdownMenuItem
					className="flex items-center cursor-pointer"
					onClick={() => {
						setQueryStates({
							...queryStates,
							showArchived: !queryStates.showArchived,
						});
						setDropdownOpen(false);
					}}
				>
					<div className="flex items-center text-sm justify-between w-full gap-2">
						{queryStates.showArchived
							? "Show active migrations"
							: "Show archived migrations"}
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
