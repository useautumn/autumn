import { IconButton } from "@autumn/ui";
import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { useProductsQueryState } from "@/views/products/hooks/useProductsQueryState";

export function ProductListMenuButton() {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const { queryStates, setQueryStates } = useProductsQueryState();

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
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
