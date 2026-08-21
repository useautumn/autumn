import { Input } from "@autumn/ui/components/ui/input";
import { cn } from "@autumn/ui/lib/utils";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";

type DropdownMenuSearchInputProps = Omit<
	ComponentProps<typeof Input>,
	"variant"
>;

export function DropdownMenuSearchInput({
	className,
	onKeyDown,
	...props
}: DropdownMenuSearchInputProps) {
	return (
		<div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
			<MagnifyingGlassIcon className="size-3.5 text-subtle" />
			<Input
				{...props}
				variant="headless"
				onKeyDown={(event) => {
					if (event.key.length === 1) event.stopPropagation();
					onKeyDown?.(event);
				}}
				className={cn("h-auto flex-1 text-xs", className)}
			/>
		</div>
	);
}
