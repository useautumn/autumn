import { ResetInterval } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { TIMINGS } from "../../buildRuleSentence";
import type { ChipOption } from "../ChipMultiSelect";

const ENUM_VALUES = {
	trial_on_end: ["bill", "revert"],
	plan_schedule: ["immediate", "end_of_cycle"],
	proration_behavior: ["prorate_immediately", "none", "bill_difference"],
	cancel_action: ["cancel_end_of_cycle", "cancel_immediately"],
	reset_interval: Object.values(ResetInterval) as string[],
};

const LABELS: Record<string, string> = {
	...TIMINGS,
	semi_annual: "Semi-annual",
	one_off: "One-off",
};

/** The list's timing labels, else the value in sentence case ("bill_difference" → "Bill difference"). */
const enumLabel = (value: string) => {
	const words = value.split("_").join(" ");
	return LABELS[value] ?? words.charAt(0).toUpperCase() + words.slice(1);
};

export type OptionSource =
	| keyof typeof ENUM_VALUES
	| "feature"
	| "catalog_plan"
	| "reward";

export const OPTION_SOURCES = [
	...Object.keys(ENUM_VALUES),
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
	return ENUM_VALUES[source].map((value) => ({
		value,
		label: enumLabel(value),
	}));
};
