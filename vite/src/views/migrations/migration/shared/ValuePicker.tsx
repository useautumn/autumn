import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_CHIPS = 3;

export type ValuePickerOption = {
	value: string;
	label: string;
	sublabel?: string;
	icon?: ReactNode;
};

export function ValuePicker({
	suggestions,
	selectedValues,
	onToggle,
	onRemove,
	placeholder = "Select...",
	className: triggerClassName,
	defaultOpen = false,
}: {
	suggestions: ValuePickerOption[];
	selectedValues: string[];
	onToggle: (value: string) => void;
	onRemove: (value: string) => void;
	placeholder?: string;
	className?: string;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);

	const getOption = (val: string) => suggestions.find((s) => s.value === val);

	return (
		<div className={cn("min-w-0", triggerClassName)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-1.5 h-8 px-3 rounded-xl input-base input-state-open-tiny cursor-pointer min-w-0 w-full text-sm overflow-hidden"
					>
						{selectedValues.length === 0 ? (
							<span className="text-tertiary-foreground">{placeholder}</span>
						) : (
							<>
								{selectedValues.slice(0, MAX_VISIBLE_CHIPS).map((val) => {
									const opt = getOption(val);
									return (
										<span
											key={val}
											className="flex items-center gap-0.5 bg-accent border border-border text-foreground rounded px-1 h-4.5 text-[10px] shrink-0 max-w-48"
										>
											{opt?.icon && (
												<span className="shrink-0 [&_svg]:size-3">
													{opt.icon}
												</span>
											)}
											<span className="truncate">{opt?.label ?? val}</span>
											<span
												className="cursor-pointer text-tertiary-foreground hover:text-destructive ml-0.5"
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
								})}
								{selectedValues.length > MAX_VISIBLE_CHIPS && (
									<span className="text-sm text-tertiary-foreground px-1 shrink-0">
										+{selectedValues.length - MAX_VISIBLE_CHIPS}
									</span>
								)}
							</>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--anchor-width) p-0 z-200 rounded-md overflow-hidden"
					style={{
						transformOrigin: "var(--radix-popover-content-transform-origin)",
					}}
				>
					<Command className="bg-interactive-secondary">
						<CommandInput placeholder="Search..." className="text-sm" />
						<CommandList>
							<CommandEmpty className="text-tertiary-foreground text-sm p-2">
								No results
							</CommandEmpty>
							<CommandGroup>
								{suggestions.map((suggestion) => {
									const isSelected = selectedValues.includes(suggestion.value);
									const keywords = [suggestion.label];
									if (suggestion.sublabel) keywords.push(suggestion.sublabel);
									return (
										<CommandItem
											key={suggestion.value}
											value={suggestion.value}
											keywords={keywords}
											onSelect={() => onToggle(suggestion.value)}
											className="text-sm"
										>
											{suggestion.icon && (
												<span className="shrink-0">{suggestion.icon}</span>
											)}
											<span className="flex-1 truncate">
												{suggestion.label}
											</span>
											{(suggestion.sublabel ??
												(suggestion.value !== suggestion.label
													? suggestion.value
													: null)) && (
												<span className="shrink-0 max-w-48 truncate text-tertiary-foreground text-xs font-mono">
													{suggestion.sublabel ?? suggestion.value}
												</span>
											)}
											{isSelected && (
												<CheckIcon size={14} className="shrink-0" />
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
