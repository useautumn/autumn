import type { BillingBehavior, FreeTrialDuration } from "@autumn/shared";
import { format } from "date-fns";
import type { FormDiscount } from "@/components/forms/attach-v2/utils/discountUtils";
import { filterValidDiscounts } from "@/components/forms/attach-v2/utils/discountUtils";
import { prorationBehaviorOption } from "@/components/forms/shared/utils/prorationBehaviorOptions";
import type { BillingCycleAnchorMode } from "@/components/forms/shared/utils/resolveBillingCycleAnchor";

const formatOptionDate = (unixMs: number) => format(unixMs, "MMM d");

const countLabel = ({ count, noun }: { count: number; noun: string }) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

/** "start Oct 7" style phrase for an optional date. */
export const datedChange = ({
	label,
	date,
}: {
	label: string;
	date: number | null;
}) => (date === null ? null : `${label} ${formatOptionDate(date)}`);

export const toggledChange = ({
	enabled,
	label,
}: {
	enabled: boolean;
	label: string;
}) => (enabled ? label : null);

export function billingCycleAnchorChange({
	enabled,
	mode,
	customAnchor,
}: {
	enabled: boolean;
	mode: BillingCycleAnchorMode;
	customAnchor: number | null;
}) {
	if (!enabled) return null;
	if (mode === "now") return "anchor now";
	return datedChange({ label: "anchor", date: customAnchor });
}

export function prorationChange({
	value,
	defaultValue,
}: {
	value: BillingBehavior;
	defaultValue: BillingBehavior;
}) {
	if (value === defaultValue) return null;
	if (value === "none") return "no proration";
	return prorationBehaviorOption(value).label.toLowerCase();
}

export function discountsChange({
	discounts,
	removedRewardIds,
}: {
	discounts: FormDiscount[];
	removedRewardIds: string[];
}) {
	const added = filterValidDiscounts(discounts).length;
	const removed = removedRewardIds.length;
	const phrases = [
		added > 0 && countLabel({ count: added, noun: "discount" }),
		removed > 0 &&
			`${countLabel({ count: removed, noun: "discount" })} removed`,
	].filter(Boolean);

	return phrases.length > 0 ? phrases.join(" · ") : null;
}

export function freeTrialChange({
	edited,
	enabled,
	length,
	duration,
}: {
	edited: boolean;
	enabled: boolean;
	length: number | null;
	duration: FreeTrialDuration;
}) {
	if (!edited) return null;
	if (!enabled || !length) return "no trial";
	return `${length}-${duration} trial`;
}
