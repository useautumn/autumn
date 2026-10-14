import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import type { ProductListItem } from "@/hooks/queries/useProductsQuery";
import { cn } from "@/lib/utils";

export function PlanVariantSelect({
	options,
	selectedId,
	onSelect,
}: {
	options: ProductListItem[];
	selectedId: string;
	onSelect: (id: string) => void;
}) {
	const selected = options.find((option) => option.id === selectedId);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					"flex max-w-[84px] shrink-0 items-center gap-0.5 rounded-[6px] bg-muted px-1 py-0",
					"text-[11px] leading-[16px] font-medium text-tertiary-foreground",
					"transition-colors hover:text-foreground",
				)}
			>
				<span className="truncate">{selected?.name}</span>
				<CaretDownIcon size={8} weight="bold" className="shrink-0" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-[110px] p-0.5">
				{options.map((option) => (
					<DropdownMenuItem
						key={option.id}
						onClick={() => onSelect(option.id)}
						className="cursor-pointer justify-between gap-2 px-1.5 py-1 text-[11px] leading-[16px]"
					>
						<span className="truncate">{option.name}</span>
						{option.id === selectedId && (
							<CheckIcon size={10} weight="bold" className="text-subtle" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
