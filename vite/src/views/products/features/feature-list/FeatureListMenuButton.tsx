import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useProductsQueryState } from "@/views/products/hooks/useProductsQueryState";

export function FeatureListMenuButton() {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const { queryStates, setQueryStates } = useProductsQueryState();

	return (
		<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					icon={<EllipsisVertical />}
					variant="secondary"
					size="default"
					iconOrientation="center"
					className="h-7!"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="text-t2">
				<DropdownMenuItem
					className="flex items-center cursor-pointer"
					onClick={() => {
						setQueryStates({
							...queryStates,
							showArchivedFeatures: !queryStates.showArchivedFeatures,
						});
						setDropdownOpen(false);
					}}
				>
					<div className="flex items-center text-sm justify-between w-full gap-2">
						{queryStates.showArchivedFeatures
							? "Show active features"
							: "Show archived features"}
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

