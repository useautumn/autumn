import { DateInputUnix, GroupedTabButton } from "@autumn/ui";
import { addDays } from "date-fns";
import { BillingOptionToggle } from "@/components/forms/shared/BillingOptionToggle";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import type { BillingOptionRule } from "@/components/forms/shared/utils/billingOptionRules";
import type { BillingCycleAnchorMode } from "@/components/forms/shared/utils/resolveBillingCycleAnchor";

const ENABLED_RULE: BillingOptionRule = {
	visible: true,
	disabled: false,
	disabledReason: null,
};

const anchorDescription = ({
	allowCustomAnchor,
	allowBackdatedStartAnchor,
}: {
	allowCustomAnchor: boolean;
	allowBackdatedStartAnchor: boolean;
}) => {
	if (allowBackdatedStartAnchor) {
		return "Restart the billing cycle now, on a future date, or on the backdated start";
	}
	if (allowCustomAnchor) {
		return "Restart the billing cycle now or on a future date";
	}
	return "Restart the billing cycle now";
};

export function BillingCycleAnchorConfigRow({
	enabled,
	mode,
	customAnchor,
	minUnixDate = Date.now(),
	maxUnixDate,
	allowCustomAnchor = true,
	allowBackdatedStartAnchor = false,
	rule = ENABLED_RULE,
	onEnabledChange,
	onModeChange,
	onCustomAnchorChange,
}: {
	enabled: boolean;
	mode: BillingCycleAnchorMode;
	customAnchor: number | null;
	minUnixDate?: number;
	maxUnixDate?: number;
	allowCustomAnchor?: boolean;
	/** The first phase is backdated over a live subscription, so the cycle can restart on that start. */
	allowBackdatedStartAnchor?: boolean;
	rule?: BillingOptionRule;
	onEnabledChange: (enabled: boolean) => void;
	onModeChange: (mode: BillingCycleAnchorMode) => void;
	onCustomAnchorChange: (anchor: number | null) => void;
}) {
	const handleModeChange = (value: string) => {
		const nextMode = value as BillingCycleAnchorMode;
		onModeChange(nextMode);
		if (nextMode === "custom" && customAnchor === null) {
			const defaultAnchor = addDays(minUnixDate, 1).getTime();
			onCustomAnchorChange(
				maxUnixDate ? Math.min(defaultAnchor, maxUnixDate) : defaultAnchor,
			);
		}
	};

	return (
		<ConfigRow
			title="Set Billing Cycle Anchor"
			description={anchorDescription({
				allowCustomAnchor,
				allowBackdatedStartAnchor,
			})}
			expanded={enabled}
			action={
				<BillingOptionToggle
					rule={rule}
					checked={enabled}
					onCheckedChange={(checked) => onEnabledChange(!!checked)}
				/>
			}
		>
			<div className="flex flex-col gap-2">
				{allowCustomAnchor && (
					<GroupedTabButton
						value={mode}
						className="w-full"
						onValueChange={handleModeChange}
						options={[
							{ value: "now", label: "Now" },
							{ value: "custom", label: "Custom" },
							...(allowBackdatedStartAnchor
								? [{ value: "phase_start", label: "Backdated start" }]
								: []),
						]}
					/>
				)}
				{allowCustomAnchor && mode === "custom" && (
					<DateInputUnix
						unixDate={customAnchor}
						setUnixDate={onCustomAnchorChange}
						disablePastDates
						disableFutureDates={maxUnixDate !== undefined}
						minUnixDate={minUnixDate}
						maxUnixDate={maxUnixDate}
						withTime
					/>
				)}
			</div>
		</ConfigRow>
	);
}
