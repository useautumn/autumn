import {
	BILLING_OPTION_SECTION_IDS,
	type BillingOptionDescriptor,
	type BillingOptionSectionId,
	type BillingOptionSectionsConfig,
	type VisibleBillingOptionSection,
} from "../types/billingOptionSectionTypes";

const SECTION_LABELS: Record<BillingOptionSectionId, string> = {
	plan: "Plan",
	charges: "Charges",
	timing: "Timing",
	balances: "Balances",
	stripe: "Stripe",
};

export function summarizeBillingOptions({
	options,
}: {
	options: BillingOptionDescriptor[];
}): string {
	const changes = options.flatMap((option) =>
		option.visible && !option.locked && option.change ? [option.change] : [],
	);
	if (changes.length === 0) return "Default";

	const summary = changes.join(" · ");
	return summary.charAt(0).toUpperCase() + summary.slice(1);
}

/** Sections in display order, keeping only those with at least one visible option. */
export function toVisibleBillingOptionSections({
	sections,
}: {
	sections: BillingOptionSectionsConfig;
}): VisibleBillingOptionSection[] {
	return BILLING_OPTION_SECTION_IDS.flatMap((id) => {
		const options = (sections[id] ?? []).filter((option) => option.visible);
		if (options.length === 0) return [];

		return [
			{
				id,
				label: SECTION_LABELS[id],
				options,
				summary: summarizeBillingOptions({ options }),
			},
		];
	});
}
