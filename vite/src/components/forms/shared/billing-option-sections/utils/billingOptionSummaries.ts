import type { BillingBehavior, FreeTrialDuration } from "@autumn/shared";
import { format } from "date-fns";
import {
	type FormDiscount,
	filterValidDiscounts,
} from "@/components/forms/shared/utils/discountUtils";
import type { BillingCycleAnchorMode } from "@/components/forms/shared/utils/resolveBillingCycleAnchor";
import type { BillingOptionSummary } from "../types/billingOptionSectionTypes";

export const formatOptionDate = (unixMs: number) => format(unixMs, "MMM d");

export const changedTo = (text: string): BillingOptionSummary => ({
	text,
	changed: true,
});

export const staysAs = (text: string): BillingOptionSummary => ({
	text,
	changed: false,
});

const countLabel = ({ count, noun }: { count: number; noun: string }) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

/** A switch that reads `changedText` when on and `defaultText` (if any) when off. */
export const switchSummary = ({
	enabled,
	changedText,
	defaultText,
}: {
	enabled: boolean;
	changedText: string;
	defaultText?: string;
}): BillingOptionSummary => {
	if (enabled) return changedTo(changedText);
	return defaultText ? staysAs(defaultText) : null;
};

export const dateSummary = ({
	label,
	date,
}: {
	label: string;
	date: number | null;
}): BillingOptionSummary =>
	date === null ? null : changedTo(`${label} ${formatOptionDate(date)}`);

export const renewsSummary = ({
	startsAt,
}: {
	startsAt: number | null | undefined;
}): BillingOptionSummary =>
	startsAt ? staysAs(`Renews ${formatOptionDate(startsAt)}`) : null;

export function anchorSummary({
	enabled,
	mode,
	customAnchor,
	defaultText,
}: {
	enabled: boolean;
	mode: BillingCycleAnchorMode;
	customAnchor: number | null;
	defaultText?: string;
}): BillingOptionSummary {
	if (!enabled) return defaultText ? staysAs(defaultText) : null;
	if (mode === "now") return changedTo("Cycle resets now");
	return dateSummary({ label: "Cycle resets", date: customAnchor });
}

const PRORATION_LABELS: Record<BillingBehavior, string> = {
	prorate_immediately: "Prorated",
	bill_difference: "Full difference",
	none: "No proration",
};

export function prorationSummary({
	value,
	defaultValue,
	labels,
}: {
	value: BillingBehavior;
	defaultValue: BillingBehavior;
	labels?: Partial<Record<BillingBehavior, string>>;
}): BillingOptionSummary {
	const text = labels?.[value] ?? PRORATION_LABELS[value];
	return value === defaultValue ? staysAs(text) : changedTo(text);
}

export function discountsSummary({
	discounts,
	removedRewardIds,
	appliedCount,
}: {
	discounts: FormDiscount[];
	removedRewardIds: string[];
	appliedCount: number;
}): BillingOptionSummary {
	const added = filterValidDiscounts(discounts).length;
	const removed = removedRewardIds.length;
	const changes = [
		added > 0 && countLabel({ count: added, noun: "discount" }),
		removed > 0 &&
			`${countLabel({ count: removed, noun: "discount" })} removed`,
	].filter(Boolean);
	if (changes.length > 0) return changedTo(changes.join(" · "));
	if (appliedCount === 0) return null;
	return staysAs(
		`${countLabel({ count: appliedCount, noun: "discount" })} applied`,
	);
}

export const trialText = ({
	length,
	duration,
}: {
	length: number | null;
	duration: FreeTrialDuration;
}) => (length ? `${length}-${duration} trial` : "No trial");

export const editedTrialSummary = ({
	edited,
	enabled,
	length,
	duration,
}: {
	edited: boolean;
	enabled: boolean;
	length: number | null;
	duration: FreeTrialDuration;
}): BillingOptionSummary => {
	const text = enabled ? trialText({ length, duration }) : "No trial";
	return edited ? changedTo(text) : staysAs(text);
};

/** A trial compared with the plan's catalog trial. */
export function catalogTrialSummary({
	enabled,
	length,
	duration,
	catalogTrial,
}: {
	enabled: boolean;
	length: number | null;
	duration: FreeTrialDuration;
	catalogTrial:
		| { length: number | string; duration: FreeTrialDuration }
		| null
		| undefined;
}): BillingOptionSummary {
	const matchesCatalog = catalogTrial
		? enabled &&
			Number(catalogTrial.length) === length &&
			catalogTrial.duration === duration
		: !enabled;
	return editedTrialSummary({
		edited: !matchesCatalog,
		enabled,
		length,
		duration,
	});
}

export const versionSummary = ({
	version,
	defaultVersion,
	defaultLabel,
}: {
	version: number | undefined;
	defaultVersion: number;
	defaultLabel: string;
}): BillingOptionSummary =>
	version === undefined || version === defaultVersion
		? staysAs(`Version ${defaultVersion} (${defaultLabel})`)
		: changedTo(`Version ${version}`);

export const carryOverSummary = ({
	enabled,
	featureIds,
	noun,
}: {
	enabled: boolean;
	featureIds: string[];
	noun: string;
}): BillingOptionSummary => {
	if (!enabled) return null;
	const scope =
		featureIds.length === 0
			? "all features"
			: countLabel({ count: featureIds.length, noun: "feature" });
	return changedTo(`Carries ${noun} (${scope})`);
};

export const collectionMethodSummary = ({
	switchesMethod,
	isActive,
	sendsInvoice,
}: {
	switchesMethod: boolean;
	isActive: boolean;
	sendsInvoice: boolean;
}): BillingOptionSummary => {
	if (!isActive) return null;
	if (!switchesMethod) return changedTo("Updates invoice settings");
	return changedTo(
		sendsInvoice
			? "Switches to invoicing"
			: "Switches to charging automatically",
	);
};
