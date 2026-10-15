import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import type { ChipOption } from "../ChipMultiSelect";

const ENUM_OPTIONS = {
	trial_on_end: [
		{ value: "bill", label: "Bill" },
		{ value: "revert", label: "Revert" },
	],
	plan_schedule: [
		{ value: "immediate", label: "Immediately" },
		{ value: "end_of_cycle", label: "End of cycle" },
	],
	proration_behavior: [
		{ value: "prorate_immediately", label: "Prorate immediately" },
		{ value: "none", label: "None" },
		{ value: "bill_difference", label: "Bill difference" },
	],
	cancel_action: [
		{ value: "cancel_end_of_cycle", label: "End of cycle" },
		{ value: "cancel_immediately", label: "Immediately" },
	],
	reset_interval: [
		{ value: "minute", label: "Minute" },
		{ value: "hour", label: "Hour" },
		{ value: "day", label: "Day" },
		{ value: "week", label: "Week" },
		{ value: "month", label: "Month" },
		{ value: "quarter", label: "Quarter" },
		{ value: "semi_annual", label: "Semi-annual" },
		{ value: "year", label: "Year" },
		{ value: "one_off", label: "One-off" },
	],
} satisfies Record<string, ChipOption[]>;

export type OptionSource =
	| keyof typeof ENUM_OPTIONS
	| "feature"
	| "catalog_plan"
	| "reward";

export const OPTION_SOURCES = [
	...Object.keys(ENUM_OPTIONS),
	"feature",
	"catalog_plan",
	"reward",
] as OptionSource[];

const toOption = ({ id, name }: { id: string; name?: string | null }) => ({
	value: id,
	label: name || id,
});

/** Choices for an id field: fixed enums, or the org's features, plans or rewards. */
export const useValueOptions = ({
	source,
}: {
	source: OptionSource;
}): ChipOption[] => {
	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();
	const { rewards } = useRewardsQuery();

	if (source === "feature") return features.map(toOption);
	if (source === "reward") return rewards.map(toOption);
	if (source === "catalog_plan") {
		const latest = new Map(products.map((plan) => [plan.id, plan]));
		return [...latest.values()].map(toOption);
	}
	return ENUM_OPTIONS[source];
};
