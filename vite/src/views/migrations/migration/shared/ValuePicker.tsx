import { CheckIcon, XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { cn } from "@/lib/utils";

export type ValuePickerOption = {
	value: string;
	label: string;
	icon?: ReactNode;
};

export function ValuePicker({
	suggestions,
	selectedValues,
	onToggle,
	onRemove,
	placeholder = "Select...",
}: {
	suggestions: ValuePickerOption[];
	selectedValues: string[];
	onToggle: (value: string) => void;
	onRemove: (value: string) => void;
	placeholder?: string;
}) {
	const [open, setOpen] = useState(false);

	const getOption = (val: string) => suggestions.find((s) => s.value === val);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="secondary"
					size="sm"
					className={cn(
						"!gap-1",
						selectedValues.length > 0 && "!h-auto min-h-6 flex-wrap",
					)}
				>
					{selectedValues.length === 0 ? (
						<span className="text-t3">{placeholder}</span>
					) : (
						selectedValues.map((val) => {
							const opt = getOption(val);
							return (
								<span
									key={val}
									className="flex items-center gap-1 bg-muted hover:bg-muted/70 text-t1 rounded px-2 py-0.5 text-xs transition-colors"
								>
									{opt?.icon && <span className="shrink-0">{opt.icon}</span>}
									<span className="truncate max-w-24">{opt?.label ?? val}</span>
									<span
										className="cursor-pointer text-t3 hover:text-destructive ml-0.5"
										onClick={(e) => {
											e.stopPropagation();
											onRemove(val);
										}}
										onPointerDown={(e) => e.stopPropagation()}
									>
										<XIcon size={10} />
									</span>
								</span>
							);
						})
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-52 p-0 z-200 rounded-md overflow-hidden"
				style={{
					transformOrigin: "var(--radix-popover-content-transform-origin)",
				}}
			>
				<Command className="bg-interactive-secondary">
					<CommandInput placeholder="Search..." className="text-xs" />
					<CommandList>
						<CommandEmpty className="text-t3 text-xs p-2">
							No results
						</CommandEmpty>
						<CommandGroup>
							{suggestions.map((suggestion) => {
								const isSelected = selectedValues.includes(suggestion.value);
								return (
									<CommandItem
										key={suggestion.value}
										value={suggestion.value}
										onSelect={() => onToggle(suggestion.value)}
										className="text-xs"
									>
										{suggestion.icon && (
											<span className="shrink-0">{suggestion.icon}</span>
										)}
										<span className="flex-1 truncate">{suggestion.label}</span>
										{isSelected && <CheckIcon size={14} className="shrink-0" />}
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
