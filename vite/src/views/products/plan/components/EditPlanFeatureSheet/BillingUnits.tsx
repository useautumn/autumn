import { useRef, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";

interface BillingUnitsProps {
	unitsPerTier: number;
	onUnitsChange: (units: number) => void;
	disabled?: boolean;
}

export function BillingUnits({
	unitsPerTier,
	onUnitsChange,
	disabled = false,
}: BillingUnitsProps) {
	const { org } = useOrg();
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [inputValue, setInputValue] = useState(unitsPerTier);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const handleEnterClick = () => {
		let num = Number(inputValue);
		if (Number.isNaN(num) || num <= 0) {
			num = 1;
		}
		onUnitsChange(num);
		setPopoverOpen(false);
	};

	const currency = org?.default_currency?.toUpperCase() ?? "USD";

	return (
		<div className="flex max-w-28 min-w-28">
			<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
				<PopoverTrigger asChild>
					<Button
						ref={triggerRef}
						size="default"
						variant="skeleton"
						disabled={disabled}
						className="w-fit max-w-32 text-body-secondary overflow-hidden hover:bg-transparent justify-start p-1 h-auto
							[&:focus]:outline-none [&:focus-visible]:outline-none [&:focus]:ring-0 [&:focus-visible]:ring-0"
					>
						<span
							className={cn(
								"truncate text-xs",
								!disabled && "border-b border-dotted border-body-secondary",
							)}
						>
							{unitsPerTier === 1
								? `${currency} per unit`
								: `${currency} per ${unitsPerTier} units`}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="max-w-md p-1" align="start">
					<Input
						type="number"
						value={inputValue}
						onChange={(e) => setInputValue(Number(e.target.value))}
						placeholder="e.g. 100 units"
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								if (popoverOpen) {
									handleEnterClick();
								}
							}
						}}
						onBlur={handleEnterClick}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
