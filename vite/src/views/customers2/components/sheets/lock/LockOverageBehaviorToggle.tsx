import { IconCheckbox } from "@autumn/ui";
import { cn } from "@/lib/utils";

export type LockOverageBehavior = "reject" | "cap" | "overflow";

const OPTIONS: { value: LockOverageBehavior; label: string }[] = [
	{ value: "reject", label: "Reject" },
	{ value: "cap", label: "Cap" },
	{ value: "overflow", label: "Overflow" },
];

export const LOCK_OVERAGE_DESCRIPTIONS: Record<LockOverageBehavior, string> = {
	reject: "Deny the check and reserve nothing if the balance is short.",
	cap: "Reserve whatever fits, stopping at zero.",
	overflow: "Reserve the full amount, letting the balance go negative.",
};

export function LockOverageBehaviorToggle({
	value,
	onChange,
}: {
	value: LockOverageBehavior;
	onChange: (value: LockOverageBehavior) => void;
}) {
	return (
		<div className="flex">
			{OPTIONS.map((option, index) => {
				const isSelected = value === option.value;
				const isFirst = index === 0;
				const isLast = index === OPTIONS.length - 1;
				return (
					<IconCheckbox
						key={option.value}
						variant="secondary"
						size="sm"
						checked={isSelected}
						onCheckedChange={() => onChange(option.value)}
						className={cn(
							"min-w-[72px] px-2 text-xs",
							!isFirst && "rounded-l-none",
							!isLast && "rounded-r-none",
							!isSelected && !isLast && "border-r-0",
						)}
					>
						{option.label}
					</IconCheckbox>
				);
			})}
		</div>
	);
}
