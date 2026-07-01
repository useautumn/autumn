import { Checkbox } from "@autumn/ui";
import type { CatalogItem } from "@/hooks/queries/useSandboxCatalogQuery";

export const CopySandboxChecklist = ({
	title,
	items,
	deselected,
	onToggle,
	isLoading,
}: {
	title: string;
	items: CatalogItem[];
	deselected: Set<string>;
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
			{items.map((item) => (
				<label
					className="flex cursor-pointer select-none items-center gap-2 text-sm"
					htmlFor={`copy-item-${item.id}`}
					key={item.id}
				>
					<Checkbox
						checked={!deselected.has(item.id)}
						id={`copy-item-${item.id}`}
						onCheckedChange={() => onToggle(item.id)}
					/>
					<span className="truncate">{item.name}</span>
					<span className="truncate text-muted-foreground text-xs">
						{item.id}
					</span>
				</label>
			))}
		</div>
	);
};
