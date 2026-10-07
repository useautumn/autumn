import {
	BILLING_OPTION_SECTION_IDS,
	type BillingOptionDescriptor,
	type BillingOptionSectionId,
	type BillingOptionSectionsConfig,
	type BillingOptionSummaryPart,
	type VisibleBillingOptionSection,
} from "../types/billingOptionSectionTypes";

const SECTION_LABELS: Record<BillingOptionSectionId, string> = {
	plan: "Plan",
	charges: "Charges",
	timing: "Timing",
	balances: "Balances",
	stripe: "Stripe",
};

/** Changed options first, then what stays as it is, each in row order. */
export function summarizeBillingOptions({
	options,
}: {
	options: BillingOptionDescriptor[];
}): BillingOptionSummaryPart[] {
	const parts = options.flatMap((option) =>
		option.visible && option.summary
			? [
					{
						text: option.summary.text,
						changed: option.summary.changed && !option.locked,
					},
				]
			: [],
	);
	return [
		...parts.filter((part) => part.changed),
		...parts.filter((part) => !part.changed),
	];
}

/** Sections in display order, keeping only those with at least one visible row. */
export function toVisibleBillingOptionSections({
	sections,
}: {
	sections: BillingOptionSectionsConfig;
}): VisibleBillingOptionSection[] {
	return BILLING_OPTION_SECTION_IDS.flatMap((id) => {
		const options = (sections[id] ?? []).filter((option) => option.visible);
		if (!options.some((option) => option.row)) return [];

		return [
			{
				id,
				label: SECTION_LABELS[id],
				options: options.filter((option) => option.row),
				summary: summarizeBillingOptions({ options }),
			},
		];
	});
}
