import { Checkbox } from "@autumn/ui";
import type { CatalogItem } from "@/hooks/queries/useSandboxCatalogQuery";
import { cn } from "@/lib/utils";

export const CopySandboxChecklist = ({
	title,
	kind,
	items,
	deselected,
	forcedBy,
	onToggle,
	isLoading,
}: {
	title: string;
	kind: string;
	items: CatalogItem[];
	deselected: Set<string>;
	forcedBy?: Map<string, string[]>;
	onToggle: (id: string) => void;
	isLoading: boolean;
}) => {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-medium text-muted-foreground text-xs">{title}</span>
			{isLoading && (
				<span className="text-muted-foreground text-xs">Loading…</span>
			)}
			{!isLoading && items.length === 0 && (
				<span className="text-muted-foreground text-xs">None</span>
			)}
			{items.map((item) => {
				const requiredBy = forcedBy?.get(item.id) ?? [];
				const isForced = requiredBy.length > 0;
				return (
					<label
						className={cn(
							"flex select-none items-center gap-2 text-sm",
							isForced ? "cursor-default" : "cursor-pointer",
						)}
						htmlFor={`copy-item-${kind}-${item.id}`}
						key={item.id}
					>
						<Checkbox
							checked={isForced || !deselected.has(item.id)}
							className={cn(isForced && "opacity-40")}
							disabled={isForced}
							id={`copy-item-${kind}-${item.id}`}
							onCheckedChange={() => onToggle(item.id)}
						/>
						<span
							className={cn("truncate", isForced && "text-muted-foreground")}
						>
							{item.name}
						</span>
						<span className="truncate text-muted-foreground text-xs">
							{item.id}
						</span>
						{isForced && (
							<span className="ml-auto shrink-0 text-muted-foreground text-xs">
								required by {requiredBy.join(", ")}
							</span>
						)}
					</label>
				);
			})}
		</div>
	);
};
