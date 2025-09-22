import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ListFilter, X } from "lucide-react";
import { useState } from "react";
import { FilterStatusSubMenu } from "./FilterStatusSubMenu";
import { SavedViews } from "./SavedViews";
import { useCustomersQueryStates } from "../../hooks/useCustomersQueryStates";
import { SaveViewPopover } from "./SavedViewPopover";
import { useSavedViewsQuery } from "../../hooks/useSavedViewsQuery";
import { ProductsSubMenu } from "./ProductsSubMenu";

function CustomersFilterButton() {
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
			<RenderFilterTrigger />
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
				<div className="flex h-9 items-stretch">
					<DropdownMenuItem
						onClick={(e) => clearFilters()}
						className="cursor-pointer justify-center gap-0 w-full"
					>
						<X size={12} className="mr-2 text-t3" />
						<p className="text-t3">Clear</p>
					</DropdownMenuItem>

					<SaveViewPopover onClose={closeFilterModal} />
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default CustomersFilterButton;

export const RenderFilterTrigger = ({ setOpen }: any) => {
	return (
		<DropdownMenuTrigger asChild>
			<Button
				variant="ghost"
				className="text-t3 bg-transparent shadow-none p-0"
			>
				<ListFilter size={13} className="mr-2 text-t3" />
				Filter
			</Button>
		</DropdownMenuTrigger>
	);
};
