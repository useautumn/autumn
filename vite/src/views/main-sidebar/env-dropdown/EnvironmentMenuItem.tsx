import { DropdownMenuItem } from "@autumn/ui";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const EnvironmentMenuItem = ({
	icon,
	name,
	hint,
	isActive,
	onSelect,
}: {
	icon: ReactNode;
	name: string;
	hint?: string;
	isActive: boolean;
	onSelect: () => void;
}) => (
	<DropdownMenuItem
		className={cn("h-7 gap-2 px-2", isActive && "text-foreground")}
		onClick={onSelect}
	>
		{icon}
		<span className="min-w-0 flex-1 truncate">{name}</span>
		{hint && !isActive && (
			<span className="shrink-0 text-xs text-tertiary-foreground">{hint}</span>
		)}
		{isActive && <Check className="size-3.5 shrink-0 text-foreground" />}
	</DropdownMenuItem>
);
