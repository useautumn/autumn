import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared "Filter" dropdown shell: the funnel trigger with an active-filter dot,
 * a body for filter sub-menus (passed as children), and a Clear footer. Callers
 * supply the sections (e.g. FilterRadioSubMenu) and the active/clear state.
 */
export function FilterButton({
	hasActiveFilters,
	onClear,
	children,
}: {
	hasActiveFilters: boolean;
	onClear: () => void;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);

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
				<DropdownMenuGroup className="p-1">{children}</DropdownMenuGroup>
				<DropdownMenuSeparator className="m-0" />
				<button
					type="button"
					onClick={onClear}
					className="flex w-full items-center justify-center gap-1.5 rounded-b-lg px-2 py-1.5 text-xs text-tertiary-foreground hover:text-muted-foreground hover:bg-accent cursor-default"
				>
					<X size={10} />
					Clear
				</button>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
