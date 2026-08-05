import { DropdownMenuTrigger } from "@autumn/ui";
import { PackageIcon, XIcon } from "@phosphor-icons/react";

const MAX_VISIBLE_CHIPS = 3;

export type SelectorChip = {
	key: string;
	label: string;
	onRemove?: () => void;
};

/** Dropdown trigger showing selected items as chips, collapsing the rest into a +N count */
export function ChipSelectTrigger({
	chips,
	placeholder,
}: {
	chips: SelectorChip[];
	placeholder: string;
}) {
	const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
	const hiddenCount = chips.length - visibleChips.length;

	return (
		<DropdownMenuTrigger className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl px-3 input-base input-state-open-tiny text-sm">
			{chips.length === 0 ? (
				<span className="text-tertiary-foreground">{placeholder}</span>
			) : (
				<>
					{visibleChips.map((chip) => (
						<span
							className="flex h-4.5 min-w-0 max-w-48 items-center gap-0.5 rounded border border-border bg-accent px-1 text-[10px] text-foreground"
							key={chip.key}
						>
							<span className="shrink-0 [&_svg]:size-3">
								<PackageIcon
									className="text-tertiary-foreground"
									size={12}
									weight="duotone"
								/>
							</span>
							<span className="truncate">{chip.label}</span>
							{chip.onRemove && (
								<span
									className="ml-0.5 shrink-0 cursor-pointer text-tertiary-foreground hover:text-destructive"
									onClick={(e) => {
										e.stopPropagation();
										chip.onRemove?.();
									}}
									onPointerDown={(e) => e.stopPropagation()}
								>
									<XIcon size={10} />
								</span>
							)}
						</span>
					))}
					{hiddenCount > 0 && (
						<span className="shrink-0 px-1 text-sm text-tertiary-foreground">
							+{hiddenCount}
						</span>
					)}
				</>
			)}
		</DropdownMenuTrigger>
	);
}
