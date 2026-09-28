import { DropdownMenuItem } from "@autumn/ui";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const EnvironmentMenuItem = ({
	icon,
	name,
	isActive,
	onSelect,
}: {
	icon: ReactNode;
	name: string;
	isActive: boolean;
	onSelect: () => void;
}) => (
	<DropdownMenuItem
		className={cn("h-7 gap-2 px-2", isActive && "text-foreground")}
		onClick={onSelect}
	>
		{icon}
		<span className="min-w-0 flex-1 truncate">{name}</span>
		{isActive && <Check className="size-3.5 shrink-0 text-foreground" />}
	</DropdownMenuItem>
);
