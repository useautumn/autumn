import type { ReactNode } from "react";

export const BILLING_OPTION_SECTION_IDS = [
	"charges",
	"timing",
	"balances",
	"stripe",
] as const;

export type BillingOptionSectionId =
	(typeof BILLING_OPTION_SECTION_IDS)[number];

export type BillingOptionDescriptor = {
	id: string;
	visible: boolean;
	/** A disabled or locked option never counts as changed. */
	locked?: boolean;
	/** Summary phrase when the option differs from its default, otherwise null. */
	change: string | null;
	row: ReactNode;
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
