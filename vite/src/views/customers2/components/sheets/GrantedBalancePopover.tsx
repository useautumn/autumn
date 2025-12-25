import { numberWithCommas } from "@autumn/shared";
import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { notNullish } from "@/utils/genUtils";

interface GrantedBalancePopoverProps {
	grantedBalance: number | null;
	onSave: (newGrantedBalance: number | null) => void;
}

export function GrantedBalancePopover({
	grantedBalance,
	onSave,
}: GrantedBalancePopoverProps) {
	const [open, setOpen] = useState(false);
	const [inputValue, setInputValue] = useState<string>(
		notNullish(grantedBalance) ? String(grantedBalance) : "",
	);

	const handleOpenChange = (isOpen: boolean) => {
		if (isOpen) {
			setInputValue(notNullish(grantedBalance) ? String(grantedBalance) : "");
		}
		setOpen(isOpen);
	};

	const handleSave = () => {
		const newValue = inputValue ? parseFloat(inputValue) : null;
		onSave(newValue);
		setOpen(false);
	};

	return (
		<div className="flex items-center gap-2">
			<span className="text-t4 text-sm">/</span>
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger asChild>
					<Button variant="muted">
						<span className="truncate min-w-0">
							{numberWithCommas(grantedBalance ?? 0)} total
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-56 p-3">
					<div className="flex flex-col gap-3">
						<div className="text-sm font-medium text-t2">
							Edit Granted Balance
						</div>
						<Input
							type="number"
							autoFocus
							placeholder="Enter balance"
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleSave();
								}
							}}
						/>
						<Button variant="primary" size="sm" onClick={handleSave}>
							Save
						</Button>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
