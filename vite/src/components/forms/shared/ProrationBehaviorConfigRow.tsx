import type { BillingBehavior } from "@autumn/shared";
import { GroupedTabButton } from "@autumn/ui";
import { BillingOptionToggle } from "@/components/forms/shared/BillingOptionToggle";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import type { BillingOptionRule } from "@/components/forms/shared/utils/billingOptionRules";

const MODE_DESCRIPTIONS: Record<Exclude<BillingBehavior, "none">, string> = {
	prorate_immediately: "Charge or credit the remaining time in this cycle",
	bill_difference:
		"Charge added items in full; credit removed items for unused time",
};

/** Proration on/off, with a Prorated / Full difference choice when on. */
export function ProrationBehaviorConfigRow({
	rule,
	value,
	onChange,
}: {
	rule: BillingOptionRule;
	value: BillingBehavior;
	onChange: (value: BillingBehavior) => void;
}) {
	const enabled = value !== "none";

	return (
		<ConfigRow
			title="Proration Behavior"
			description="Invoice price differences when changing plans mid-cycle"
			expanded={enabled}
			action={
				<BillingOptionToggle
					rule={rule}
					checked={enabled}
					onCheckedChange={(checked) =>
						onChange(checked ? "prorate_immediately" : "none")
					}
				/>
			}
		>
			{enabled && (
				<div className="flex flex-col gap-1.5">
					<GroupedTabButton
						value={value}
						className="w-full"
						disabled={rule.disabled}
						onValueChange={(mode) => onChange(mode as BillingBehavior)}
						options={[
							{ value: "prorate_immediately", label: "Prorated" },
							{ value: "bill_difference", label: "Full difference" },
						]}
					/>
					<span className="text-xs text-tertiary-foreground/70">
						{MODE_DESCRIPTIONS[value]}
					</span>
				</div>
			)}
		</ConfigRow>
	);
}
