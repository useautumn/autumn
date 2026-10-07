import type { ReactNode } from "react";

export const BILLING_OPTION_SECTION_IDS = [
	"plan",
	"charges",
	"timing",
	"balances",
	"stripe",
] as const;

export type BillingOptionSectionId =
	(typeof BILLING_OPTION_SECTION_IDS)[number];

/** What an option means for this request; `changed` when the user moved it off its default. */
export type BillingOptionSummary = { text: string; changed: boolean } | null;

export type BillingOptionDescriptor = {
	id: string;
	visible: boolean;
	/** A disabled or locked option never counts as changed. */
	locked?: boolean;
	summary: BillingOptionSummary;
	/** Omit for a summary-only fact, such as the renewal date. */
	row?: ReactNode;
};

/** Which options each section holds, in row order. */
export type BillingOptionSectionsConfig = Partial<
	Record<BillingOptionSectionId, BillingOptionDescriptor[]>
>;

export type VisibleBillingOptionSection = {
	id: BillingOptionSectionId;
	label: string;
	options: BillingOptionDescriptor[];
	summary: string;
};
