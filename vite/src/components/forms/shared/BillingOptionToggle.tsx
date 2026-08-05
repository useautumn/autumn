import { Switch, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import type { BillingOptionRule } from "./utils/billingOptionRules";

/** Switch for one billing option; wraps in a tooltip when the rule explains why it's off. */
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
