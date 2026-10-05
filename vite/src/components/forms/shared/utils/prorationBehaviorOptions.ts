import {
	type BillingBehavior,
	PhaseProrationBehaviorSchema,
} from "@autumn/shared";
import {
	ChartPieSliceIcon,
	EqualsIcon,
	type Icon,
	ProhibitIcon,
} from "@phosphor-icons/react";

type ProrationBehaviorOption = {
	value: BillingBehavior;
	label: string;
	icon: Icon;
};

export const PRORATION_BEHAVIOR_OPTIONS: ProrationBehaviorOption[] = [
	{ value: "prorate_immediately", label: "Prorated", icon: ChartPieSliceIcon },
	{ value: "bill_difference", label: "Full difference", icon: EqualsIcon },
	{ value: "none", label: "None", icon: ProhibitIcon },
];

export const prorationBehaviorOption = (value: BillingBehavior) =>
	PRORATION_BEHAVIOR_OPTIONS.find((option) => option.value === value) ??
	PRORATION_BEHAVIOR_OPTIONS[0];

/** Stripe bills a later phase's start, which has no full-difference mode. */
export const LATER_PHASE_PRORATION_OPTIONS = PRORATION_BEHAVIOR_OPTIONS.filter(
	(option) => PhaseProrationBehaviorSchema.safeParse(option.value).success,
);
