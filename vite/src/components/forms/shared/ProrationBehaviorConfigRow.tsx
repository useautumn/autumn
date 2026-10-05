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

const BACKDATED_GAP_MODE_DESCRIPTIONS: Record<
	Exclude<BillingBehavior, "none">,
	string
> = {
	prorate_immediately: "Charge the backdated time for the days it covers",
	bill_difference: "Charge every billing cycle the backdated time reaches",
};

/** Proration on/off, with a Prorated / Full difference choice when on. */
export function ProrationBehaviorConfigRow({
	rule,
	value,
	onChange,
	billsBackdatedGap = false,
}: {
	rule: BillingOptionRule;
	value: BillingBehavior;
	onChange: (value: BillingBehavior) => void;
	/** The first phase is backdated before the live subscription started, so proration bills that time. */
	billsBackdatedGap?: boolean;
}) {
	const enabled = value !== "none";
	const modeDescriptions = billsBackdatedGap
		? BACKDATED_GAP_MODE_DESCRIPTIONS
		: MODE_DESCRIPTIONS;

	return (
		<ConfigRow
			title="Proration Behavior"
			description={
				billsBackdatedGap
					? "Bill the backdated time before the current subscription started"
					: "Invoice price differences when changing plans mid-cycle"
			}
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
						{modeDescriptions[value]}
					</span>
				</div>
			)}
		</ConfigRow>
	);
}
