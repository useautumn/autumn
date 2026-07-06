import { CURRENCY_CODES, currencyDisplayName } from "@autumn/shared";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	IconButton,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";

export const CurrencyPicker = ({
	excludedCodes,
	onSelect,
	label,
}: {
	excludedCodes: string[];
	onSelect: (code: string) => void;
	label: string;
}) => {
	const [open, setOpen] = useState(false);
	const excluded = new Set(excludedCodes.map((code) => code.toLowerCase()));
	const options = CURRENCY_CODES.filter((code) => !excluded.has(code));

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<IconButton
					className="text-tertiary-foreground text-xs"
					icon={<PlusIcon size={10} />}
					iconOrientation="left"
					variant="muted"
				>
					{label}
				</IconButton>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-0">
				<Command>
					<CommandInput className="h-9" placeholder="Search currency..." />
					<CommandList>
						<CommandEmpty className="py-2 text-center text-tertiary-foreground text-sm">
							No currency found.
						</CommandEmpty>
						<CommandGroup>
							{options.map((code) => (
								<CommandItem
									key={code}
									onSelect={() => {
										onSelect(code);
										setOpen(false);
									}}
									value={`${code} ${currencyDisplayName(code)}`}
								>
									<span className="font-medium uppercase">{code}</span>
									<span className="ml-2 truncate text-tertiary-foreground">
										{currencyDisplayName(code)}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
