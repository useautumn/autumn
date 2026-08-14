import type { CustomerListSortBy, SortOrder } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import {
	ArrowsDownUpIcon,
	SortAscendingIcon,
	SortDescendingIcon,
} from "@phosphor-icons/react";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";

const SORT_FIELDS: { value: CustomerListSortBy; label: string }[] = [
	{ value: "created_at", label: "Created at" },
	{ value: "base_price", label: "Base price" },
];

const SORT_ORDERS: {
	value: SortOrder;
	label: string;
	icon: React.ReactNode;
}[] = [
	{
		value: "asc",
		label: "Ascending",
		icon: <SortAscendingIcon size={14} className="text-tertiary-foreground" />,
	},
	{
		value: "desc",
		label: "Descending",
		icon: <SortDescendingIcon size={14} className="text-tertiary-foreground" />,
	},
];

function SortFieldSubMenu({
	field,
	onSelect,
}: {
	field: { value: CustomerListSortBy; label: string };
	onSelect: (order: SortOrder) => void;
}) {
	const { queryStates } = useCustomerFilters();
	const isActiveField = queryStates.sortBy === field.value;

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				{field.label}
				{isActiveField && <Check size={12} className="text-primary" />}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				{SORT_ORDERS.map((order) => (
					<DropdownMenuItem
						key={order.value}
						onClick={() => onSelect(order.value)}
						className="flex items-center gap-2 cursor-pointer text-sm"
					>
						{order.icon}
						{order.label}
						{isActiveField && queryStates.sort === order.value && (
							<Check size={12} className="ml-auto text-primary" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function CustomerListSortButton() {
	const { queryStates, setFilters } = useCustomerFilters();
	const [open, setOpen] = useState(false);

	// Anything other than the default created_at desc counts as an active sort.
	const hasActiveSort =
		queryStates.sortBy !== "created_at" || queryStates.sort !== "desc";

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				render={<div className="relative" />}
				nativeButton={false}
			>
				<IconButton
					variant="secondary"
					aria-label="Sort"
					className={cn(open && "btn-secondary-active")}
					icon={
						<ArrowsDownUpIcon size={14} className="text-tertiary-foreground" />
					}
				/>
				{hasActiveSort && (
					<span className="absolute top-0 right-0 h-2.5 w-2.5 translate-x-1/3 -translate-y-1/3 rounded-full bg-primary" />
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-44 font-regular gap-0 p-0"
				align="start"
			>
				<DropdownMenuGroup className="p-1">
					{SORT_FIELDS.map((field) => (
						<SortFieldSubMenu
							key={field.value}
							field={field}
							onSelect={(order) => {
								setFilters({ sortBy: field.value, sort: order });
								setOpen(false);
							}}
						/>
					))}
				</DropdownMenuGroup>
				<DropdownMenuSeparator className="m-0" />
				<button
					type="button"
					onClick={() => {
						setFilters({ sortBy: "created_at", sort: "desc" });
						setOpen(false);
					}}
					className="w-full flex items-center justify-center gap-1.5 rounded-b-lg px-2 py-1.5 text-xs text-tertiary-foreground hover:text-muted-foreground hover:bg-accent cursor-default"
				>
					<X size={10} />
					Clear
				</button>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
