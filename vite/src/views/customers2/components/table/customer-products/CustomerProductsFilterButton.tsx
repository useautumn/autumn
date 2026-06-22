import { CustomerProductKind } from "@autumn/shared";
import { Checkbox, IconButton } from "@autumn/ui";
import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import { useState } from "react";
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
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import type { CustomerProductsKindFilter } from "@/views/customers2/hooks/useCustomerProductsTableState";

const KIND_OPTIONS: { label: string; value: CustomerProductsKindFilter }[] = [
	{ label: "All types", value: "all" },
	{ label: "Subscriptions", value: CustomerProductKind.Subscription },
	{ label: "One-off", value: CustomerProductKind.OneOff },
	{ label: "Add-ons", value: CustomerProductKind.AddOn },
];

export function CustomerProductsFilterButton({
	kind,
	setKind,
	showExpired,
	setShowExpired,
}: {
	kind: CustomerProductsKindFilter;
	setKind: (kind: CustomerProductsKindFilter) => void;
	showExpired: boolean;
	setShowExpired: (showExpired: boolean) => void;
}) {
	const [open, setOpen] = useState(false);

	const kindLabel = KIND_OPTIONS.find((option) => option.value === kind)?.label;
	const hasActiveFilters = kind !== "all" || showExpired;

	const clearFilters = () => {
		setKind("all");
		setShowExpired(false);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				render={<div className="relative" />}
				nativeButton={false}
			>
				<IconButton
					variant="secondary"
					className={cn("gap-2", open && "btn-secondary-active")}
					icon={
						<FunnelSimpleIcon size={14} className="text-tertiary-foreground" />
					}
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
					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
							Type
							{kind !== "all" && (
								<span className="text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
									{kindLabel}
								</span>
							)}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{KIND_OPTIONS.map((option) => (
								<DropdownMenuItem
									key={option.value}
									closeOnClick={false}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setKind(option.value);
									}}
									className="flex items-center gap-2 cursor-pointer text-sm"
								>
									<Checkbox
										checked={kind === option.value}
										className="border-border"
									/>
									{option.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
							Status
							{showExpired && (
								<span className="text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
									Expired
								</span>
							)}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{[
								{ label: "Active", value: false },
								{ label: "Show expired", value: true },
							].map((option) => (
								<DropdownMenuItem
									key={option.label}
									closeOnClick={false}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setShowExpired(option.value);
									}}
									className="flex items-center gap-2 cursor-pointer text-sm"
								>
									<Checkbox
										checked={showExpired === option.value}
										className="border-border"
									/>
									{option.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuGroup>
				<DropdownMenuSeparator className="m-0" />
				<button
					type="button"
					onClick={clearFilters}
					className="flex w-full items-center justify-center gap-1.5 rounded-b-lg px-2 py-1.5 text-xs text-tertiary-foreground hover:text-muted-foreground hover:bg-accent cursor-default"
				>
					<X size={10} />
					Clear
				</button>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
