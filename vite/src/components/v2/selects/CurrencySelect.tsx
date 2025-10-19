import { Check, ChevronsUpDown } from "lucide-react";
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
import { stripeCurrencyCodes } from "@/utils/constants/stripeCurrencyCodes";

export const CurrencySelect = ({
	defaultCurrency,
	setDefaultCurrency,
	className,
	disabled,
}: {
	defaultCurrency: string;
	setDefaultCurrency: (currency: string) => void;
	className?: string;
	disabled?: boolean;
}) => {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="secondary"
					role="combobox"
					aria-expanded={open}
					className={cn("w-full justify-between", className)}
					disabled={disabled}
					disableActive
				>
					{defaultCurrency ? defaultCurrency : "Select currency..."}
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
				<Command className="p-0">
					<CommandInput placeholder="Search currency..." />
					<CommandEmpty>No currency found.</CommandEmpty>
					<CommandList className="p-0">
						<CommandGroup className="p-0">
							{stripeCurrencyCodes.map((currency) => (
								<CommandItem
									key={currency.code}
									value={currency.code}
									onSelect={(value) => {
										setDefaultCurrency(value.toUpperCase());
										setOpen(false);
									}}
									className="p-2 flex items-center justify-between"
								>
									{currency.currency} - {currency.code}
									<Check
										className={cn(
											"mr-2 h-4 w-4",
											defaultCurrency === currency.code
												? "opacity-100"
												: "opacity-0",
										)}
									/>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
