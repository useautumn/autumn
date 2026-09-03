import {
	Button,
	LabelInput,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CreditBillingUnitsProps {
	value: number | undefined;
	unitName: string;
	isAiChild: boolean;
	onValueChange: (value: number) => void;
	className?: string;
}

export function CreditBillingUnits({
	value,
	unitName,
	isAiChild,
	onValueChange,
	className,
}: CreditBillingUnitsProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState("");

	const billingUnits = value ?? 1;
	const label = isAiChild
		? `credits per $${billingUnits} ${unitName}`
		: billingUnits === 1
			? `credits per ${unitName}`
			: `credits per ${billingUnits} ${unitName}`;

	const commit = () => {
		const parsed = Number(draft);
		const isValid = draft !== "" && Number.isFinite(parsed) && parsed > 0;
		onValueChange(isValid ? parsed : 1);
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(isOpen) => {
				setOpen(isOpen);
				if (isOpen) setDraft(String(billingUnits));
			}}
		>
			<PopoverTrigger asChild>
				<Button
					aria-label="Billing units"
					variant="muted"
					className={cn(
						"min-w-0 justify-start overflow-hidden text-tertiary-foreground",
						className,
					)}
				>
					<span className="min-w-0 truncate text-xs">{label}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="max-w-[200px] p-3 pt-2 z-200" align="start">
				<LabelInput
					label={
						isAiChild
							? "Billing units ($ of AI usage)"
							: `Billing units (${unitName})`
					}
					type="number"
					step="any"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder="e.g. 100"
					onKeyDown={(e) => {
						if (e.key === "-" || e.key === "Minus") e.preventDefault();
						if (e.key === "Enter") commit();
					}}
					onBlur={commit}
				/>
			</PopoverContent>
		</Popover>
	);
}
