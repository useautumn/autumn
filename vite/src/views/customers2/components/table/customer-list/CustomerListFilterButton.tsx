import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { cn } from "@/lib/utils";
import { FilterStatusSubMenu } from "@/views/customers/components/filter-dropdown/FilterStatusSubMenu";
import { ProductsSubMenu } from "@/views/customers/components/filter-dropdown/ProductsSubMenu";
import { SaveViewPopover } from "@/views/customers/components/filter-dropdown/SavedViewPopover";
import { SavedViews } from "@/views/customers/components/filter-dropdown/SavedViews";
import { useCustomersQueryStates } from "@/views/customers/hooks/useCustomersQueryStates";
import { useSavedViewsQuery } from "@/views/customers/hooks/useSavedViewsQuery";

export function CustomerListFilterButton() {
	const { setQueryStates } = useCustomersQueryStates();
	const [open, setOpen] = useState(false);

	const { data, refetch: refetchSavedViews } = useSavedViewsQuery();

	const views = data?.views || [];

	const clearFilters = () => {
		setQueryStates({
			status: [],
			version: [],
			none: false,
		});
	};

	const closeFilterModal = () => {
		setOpen(false);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					variant="secondary"
					size="default"
					className={cn("gap-2", open && "btn-secondary-active")}
					icon={<FunnelSimpleIcon size={14} className="text-t3" />}
				>
					Filter
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-56 font-regular text-zinc-800 gap-0 p-0"
				align="start"
			>
				<DropdownMenuGroup className="p-1">
					<FilterStatusSubMenu />
					<ProductsSubMenu />
				</DropdownMenuGroup>
				<DropdownMenuSeparator className="m-0" />
				{views.length > 0 && (
					<SavedViews
						views={views}
						mutateViews={refetchSavedViews}
						setDropdownOpen={setOpen}
					/>
				)}
				<div className="flex h-9 items-stretch justify-between">
					<DropdownMenuItem
						onClick={() => clearFilters()}
						className="cursor-pointer justify-center gap-0 flex-1"
					>
						<X size={12} className="mr-2 text-t3" />
						<p className="text-t3">Clear</p>
					</DropdownMenuItem>

					<div className="flex-1">
						<SaveViewPopover onClose={closeFilterModal} />
					</div>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
