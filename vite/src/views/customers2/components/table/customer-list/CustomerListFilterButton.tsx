import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import { FilterStatusSubMenu } from "@/views/customers/components/filter-dropdown/FilterStatusSubMenu";
import { ProcessorSubMenu } from "@/views/customers/components/filter-dropdown/ProcessorSubMenu";
import { ProductsSubMenu } from "@/views/customers/components/filter-dropdown/ProductsSubMenu";
import { SaveViewPopover } from "@/views/customers/components/filter-dropdown/SavedViewPopover";
import { SavedViews } from "@/views/customers/components/filter-dropdown/SavedViews";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";
import { useSavedViewsQuery } from "@/views/customers/hooks/useSavedViewsQuery";

interface CustomerListFilterButtonProps {
	extraMenuItems?: React.ReactNode;
	hasActiveExtraFilters?: boolean;
	onClearExtra?: () => void;
	onFilterChange?: () => void;
	hideSavedViews?: boolean;
}

export function CustomerListFilterButton({
	extraMenuItems,
	hasActiveExtraFilters,
	onClearExtra,
	onFilterChange,
	hideSavedViews,
}: CustomerListFilterButtonProps = {}) {
	const { queryStates, setFilters } = useCustomerFilters();
	const [open, setOpen] = useState(false);

	const hasActiveFilters =
		hasActiveExtraFilters ||
		queryStates.status.length > 0 ||
		queryStates.version.length > 0 ||
		queryStates.none ||
		queryStates.processor.length > 0;

	const { data, refetch: refetchSavedViews } = useSavedViewsQuery();

	const views = data?.views || [];

	const clearFilters = () => {
		setFilters({ status: [], version: [], none: false, processor: [] });
		onFilterChange?.();
		onClearExtra?.();
	};

	const closeFilterModal = () => {
		setOpen(false);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger render={<div className="relative" />} nativeButton={false}>
				<IconButton
					variant="secondary"
					className={cn("gap-2", open && "btn-secondary-active")}
					icon={<FunnelSimpleIcon size={14} className="text-tertiary-foreground" />}
				>
					Filter
				</IconButton>
				{hasActiveFilters && (
					<span className="absolute top-0 right-0 h-2.5 w-2.5 translate-x-1/3 -translate-y-1/3 rounded-full bg-primary" />
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-56 font-regular gap-0 p-0"
				align="start"
			>
				<DropdownMenuGroup className="p-1">
					{extraMenuItems}
					<FilterStatusSubMenu onChange={onFilterChange} />
					<ProductsSubMenu onChange={onFilterChange} />
					<ProcessorSubMenu onChange={onFilterChange} />
				</DropdownMenuGroup>
				<DropdownMenuSeparator className="m-0" />
				{!hideSavedViews && views.length > 0 && (
					<SavedViews
						views={views}
						mutateViews={refetchSavedViews}
						setDropdownOpen={setOpen}
					/>
				)}
				<div className="flex items-stretch">
					<button
						type="button"
						onClick={clearFilters}
						className="flex-1 flex items-center justify-center gap-1.5 rounded-bl-lg px-2 py-1.5 text-xs text-tertiary-foreground hover:text-muted-foreground hover:bg-accent cursor-default"
					>
						<X size={10} />
						Clear
					</button>
					<SaveViewPopover onClose={closeFilterModal} />
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
