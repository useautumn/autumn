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
import { CheckIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ValueChip } from "./ValueChip";

const MAX_VISIBLE_CHIPS = 3;
const MIN_LIST_HEIGHT = 240;

type PickerSide = "top" | "bottom";

/** Chosen once on open so the list never flips while chips change or the page scrolls. */
const sideForTrigger = (trigger: Element | undefined): PickerSide => {
	if (!trigger) return "bottom";
	const { top, bottom } = trigger.getBoundingClientRect();
	const spaceBelow = window.innerHeight - bottom;
	return spaceBelow < MIN_LIST_HEIGHT && top > spaceBelow ? "top" : "bottom";
};

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
	const [popup, setPopup] = useState<{ open: boolean; side: PickerSide }>({
		open: defaultOpen,
		side: "bottom",
	});

	const getOption = (val: string) => suggestions.find((s) => s.value === val);

	return (
		<div className={cn("min-w-0", triggerClassName)}>
			<Popover
				open={popup.open}
				onOpenChange={(open, { trigger }) =>
					setPopup({ open, side: open ? sideForTrigger(trigger) : popup.side })
				}
			>
				<PopoverTrigger
					render={
						<button
							type="button"
							className="flex items-center gap-1.5 h-8 px-3 rounded-xl input-base input-state-open-tiny cursor-pointer min-w-0 w-full text-sm overflow-hidden"
						/>
					}
				>
					{selectedValues.length === 0 ? (
						<span className="text-tertiary-foreground">{placeholder}</span>
					) : (
						<>
							{selectedValues.slice(0, MAX_VISIBLE_CHIPS).map((val) => {
								const opt = getOption(val);
								return (
									<ValueChip
										key={val}
										label={opt?.label ?? val}
										icon={opt?.icon}
										onRemove={() => onRemove(val)}
										interactive={false}
									/>
								);
							})}
							{selectedValues.length > MAX_VISIBLE_CHIPS && (
								<span className="text-sm text-tertiary-foreground px-1 shrink-0">
									+{selectedValues.length - MAX_VISIBLE_CHIPS}
								</span>
							)}
						</>
					)}
				</PopoverTrigger>
				<PopoverContent
					side={popup.side}
					align="start"
					collisionAvoidance={{ side: "none", fallbackAxisSide: "none" }}
					className="flex flex-col w-(--anchor-width) max-h-(--available-height) p-0 overflow-hidden"
				>
					<Command className="bg-interactive-secondary *:data-[slot=command-input-wrapper]:shrink-0">
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
