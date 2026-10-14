import { Switch, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import type { BillingOptionRule } from "./utils/billingOptionRules";

export function BillingOptionToggle({
	rule,
	checked,
	onCheckedChange,
}: {
	rule: BillingOptionRule;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	const toggle = (
		<Switch
			checked={checked}
			disabled={rule.disabled}
			onCheckedChange={onCheckedChange}
		/>
	);

	if (!rule.disabledReason) return toggle;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex">{toggle}</span>
			</TooltipTrigger>
			<TooltipContent>{rule.disabledReason}</TooltipContent>
		</Tooltip>
	);
}
