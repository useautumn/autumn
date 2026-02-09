import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";

export type SearchableSelectProps<T> = {
	value: string | null;
	onValueChange: (value: string) => void;
	options: T[];
	getOptionValue: (option: T) => string;
	getOptionLabel: (option: T) => string;
	getOptionDisabled?: (option: T) => boolean;
	renderOption?: (option: T, isSelected: boolean) => ReactNode;
	renderValue?: (option: T | undefined) => ReactNode;
	placeholder?: string;
	searchable?: boolean;
	searchPlaceholder?: string;
	emptyText?: string;
	disabled?: boolean;
	triggerClassName?: string;
	contentClassName?: string;
	defaultOpen?: boolean;
};

export function SearchableSelect<T>({
	value,
	onValueChange,
	options,
	getOptionValue,
	getOptionLabel,
	getOptionDisabled,
	renderOption,
	renderValue,
	placeholder = "Select...",
	searchable = false,
	searchPlaceholder = "Search...",
	emptyText = "No results found",
	disabled = false,
	triggerClassName,
	contentClassName,
	defaultOpen = false,
}: SearchableSelectProps<T>) {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!defaultOpen) return;
		const timer = setTimeout(() => setOpen(true), 200);
		return () => clearTimeout(timer);
	}, [defaultOpen]);

	const selectedOption = options.find((opt) => getOptionValue(opt) === value);

	const handleSelect = (option: T) => {
		if (getOptionDisabled?.(option)) return;
		onValueChange(getOptionValue(option));
		setOpen(false);
	};

	const defaultRenderValue = (option: T | undefined) => {
		if (!option) return <span className="text-t3">{placeholder}</span>;
		return <span>{getOptionLabel(option)}</span>;
	};

	const defaultRenderOption = (option: T, isSelected: boolean) => {
		const isDisabled = getOptionDisabled?.(option) ?? false;
		return (
			<>
				<span className="flex-1 truncate min-w-0">
					{getOptionLabel(option)}
				</span>
				{isSelected && !isDisabled && <CheckIcon className="size-4 shrink-0" />}
			</>
		);
	};

	return (
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
						triggerClassName,
					)}
				>
					<div className="flex items-center gap-2 min-w-0 flex-1">
						<span className="truncate min-w-0">
							{renderValue
								? renderValue(selectedOption)
								: defaultRenderValue(selectedOption)}
						</span>
					</div>
					<ChevronDownIcon className="size-4 shrink-0 opacity-50" />
				</button>
			</PopoverTrigger>
			<AnimatePresence>
				{open && (
					<PopoverContent
						forceMount
						align="start"
						className={cn(
							"w-(--radix-popover-trigger-width) p-0 z-200 rounded-md overflow-hidden",
							contentClassName,
						)}
						asChild
					>
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.3 }}
						>
							<Command
								className="bg-interactive-secondary"
								filter={
									searchable
										? (optionValue, search) => {
												const option = options.find(
													(opt) => getOptionValue(opt) === optionValue,
												);
												if (!option) return 0;
												const searchLower = search.toLowerCase();
												const labelMatch = getOptionLabel(option)
													.toLowerCase()
													.includes(searchLower);
												const valueMatch = optionValue
													.toLowerCase()
													.includes(searchLower);
												return labelMatch || valueMatch ? 1 : 0;
											}
										: undefined
								}
							>
								{searchable && <CommandInput placeholder={searchPlaceholder} />}
								<CommandList>
									<CommandEmpty className="text-t3">{emptyText}</CommandEmpty>
									<CommandGroup>
										{options.map((option) => {
											const optionValue = getOptionValue(option);
											const isSelected = optionValue === value;
											const isDisabled = getOptionDisabled?.(option) ?? false;

											return (
												<CommandItem
													key={optionValue}
													value={optionValue}
													onSelect={() => handleSelect(option)}
													disabled={isDisabled}
													className={cn(
														"min-w-0",
														isDisabled &&
															"text-t4 pointer-events-none opacity-50",
													)}
												>
													{renderOption
														? renderOption(option, isSelected)
														: defaultRenderOption(option, isSelected)}
												</CommandItem>
											);
										})}
									</CommandGroup>
								</CommandList>
							</Command>
						</motion.div>
					</PopoverContent>
				)}
			</AnimatePresence>
		</Popover>
	);
}
