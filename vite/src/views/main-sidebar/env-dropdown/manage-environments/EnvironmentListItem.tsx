import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const EnvironmentListItem = ({
	icon,
	name,
	isSelected,
	hasUnsavedChanges = false,
	onSelect,
}: {
	icon: ReactNode;
	name: string;
	isSelected: boolean;
	hasUnsavedChanges?: boolean;
	onSelect: () => void;
}) => (
	<button
		aria-current={isSelected ? "true" : undefined}
		className={cn(
			"flex h-8 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-left text-sm outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring",
			isSelected
				? "bg-foreground/[0.07] font-medium text-foreground"
				: "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
		)}
		onClick={onSelect}
		type="button"
	>
		{icon}
		<span className="min-w-0 flex-1 truncate">{name}</span>
		{hasUnsavedChanges && (
			<>
				<span
					aria-hidden="true"
					className="size-1.5 shrink-0 rounded-full bg-primary"
				/>
				<span className="sr-only">Unsaved changes</span>
			</>
		)}
	</button>
);
