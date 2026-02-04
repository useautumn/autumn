import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { FieldInfo } from "@/components/general/form/field-info";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useFieldContext } from "@/hooks/form/form-context";
import { cn } from "@/lib/utils";

export type SelectFieldOption<T extends string | number = string> = {
	label: string;
	value: T;
	disabledValue?: string;
};

export function SelectField<T extends string | number = string>({
	label,
	options,
	placeholder,
	textAfter,
	className,
	hideFieldInfo,
	selectValueAfter,
	disabled,
	searchable = false,
	searchPlaceholder = "Search...",
	emptyText = "No results found",
}: {
	label: string;
	options: SelectFieldOption<T>[];
	placeholder: string;
	textAfter?: string;
	className?: string;
	hideFieldInfo?: boolean;
	selectValueAfter?: React.ReactNode;
	disabled?: boolean;
	searchable?: boolean;
	searchPlaceholder?: string;
	emptyText?: string;
}) {
	const field = useFieldContext<T>();
	const [open, setOpen] = useState(false);

	const stringValue = String(field.state.value);
	const selectedOption = options.find(
		(opt) => String(opt.value) === stringValue,
	);

	const handleSelect = (option: SelectFieldOption<T>) => {
		if (option.disabledValue) return;
		field.handleChange(option.value);
		setOpen(false);
	};

	return (
		<div className={className}>
			{label && <Label>{label}</Label>}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild disabled={disabled}>
					<button
						type="button"
						aria-expanded={open}
						aria-haspopup="listbox"
						disabled={disabled}
						className={cn(
							"flex items-center justify-between gap-2 w-full min-w-0 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 rounded-lg",
							"input-base input-shadow-default",
							open && "input-shadow-focus border-primary",
							!open && "hover:input-shadow-hover",
						)}
					>
						<div className="flex items-center gap-2 min-w-0 flex-1">
							<span
								className={cn("truncate min-w-0", !selectedOption && "text-t3")}
							>
								{selectedOption?.label || placeholder}
							</span>
							{selectValueAfter && selectedOption && (
								<span className="shrink-0">{selectValueAfter}</span>
							)}
						</div>
						<ChevronDownIcon className="size-4 shrink-0 opacity-50" />
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-[var(--radix-popover-trigger-width)] p-0 z-[200] rounded-md overflow-hidden"
				>
					<Command
						className="bg-interactive-secondary"
						filter={
							searchable
								? (value, search) => {
										const option = options.find(
											(opt) => String(opt.value) === value,
										);
										if (!option) return 0;
										const searchLower = search.toLowerCase();
										const labelMatch = option.label
											.toLowerCase()
											.includes(searchLower);
										const valueMatch = String(option.value)
											.toLowerCase()
											.includes(searchLower);
										return labelMatch || valueMatch ? 1 : 0;
									}
								: undefined
						}
					>
						{searchable && <CommandInput placeholder={searchPlaceholder} />}
						<CommandList>
							<CommandEmpty>{emptyText}</CommandEmpty>
							<CommandGroup>
								{options.map((option) => {
									const isSelected = String(option.value) === stringValue;
									const isDisabled = !!option.disabledValue;

									return (
										<CommandItem
											key={String(option.value)}
											value={String(option.value)}
											onSelect={() => handleSelect(option)}
											disabled={isDisabled}
											className={cn(
												"min-w-0",
												isDisabled && "text-t4 pointer-events-none opacity-50",
											)}
										>
											<span className="flex-1 truncate min-w-0">
												{option.label}
											</span>
											{option.disabledValue && (
												<span className="shrink-0 text-xs text-t3 bg-muted px-1 py-0 rounded-md">
													{option.disabledValue}
												</span>
											)}
											{isSelected && !isDisabled && (
												<CheckIcon className="size-4 shrink-0" />
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
			{textAfter && (
				<section
					aria-live="polite"
					className="mt-2 text-muted-foreground text-xs"
				>
					{textAfter}
				</section>
			)}
			{!hideFieldInfo && <FieldInfo field={field} />}
		</div>
	);
}
