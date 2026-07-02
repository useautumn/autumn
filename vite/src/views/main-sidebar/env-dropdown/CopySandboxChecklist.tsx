import { Checkbox } from "@autumn/ui";
import type { CatalogItem } from "@/hooks/queries/useSandboxCatalogQuery";
import { cn } from "@/lib/utils";

export const CopySandboxChecklist = ({
	title,
	kind,
	items,
	deselected,
	forced,
	onToggle,
	isLoading,
}: {
	title: string;
	kind: string;
	items: CatalogItem[];
	deselected: Set<string>;
	forced?: Set<string>;
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
				const isForced = forced?.has(item.id) ?? false;
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
							disabled={isForced}
							id={`copy-item-${kind}-${item.id}`}
							onCheckedChange={() => onToggle(item.id)}
						/>
						<span className="truncate">{item.name}</span>
						<span className="truncate text-muted-foreground text-xs">
							{item.id}
						</span>
						{isForced && (
							<span className="ml-auto shrink-0 text-muted-foreground text-xs">
								required by a plan
							</span>
						)}
					</label>
				);
			})}
		</div>
	);
};
