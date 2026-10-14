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

export type BillingOptionSummary = { text: string; changed: boolean } | null;

export type BillingOptionDescriptor = {
	id: string;
	visible: boolean;
	locked?: boolean;
	summary: BillingOptionSummary;
	row?: ReactNode;
};

export type BillingOptionSectionsConfig = Partial<
	Record<BillingOptionSectionId, BillingOptionDescriptor[]>
>;

export type VisibleBillingOptionSection = {
	id: BillingOptionSectionId;
	label: string;
	options: BillingOptionDescriptor[];
	summary: string;
};
