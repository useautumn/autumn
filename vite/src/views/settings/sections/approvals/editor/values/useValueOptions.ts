import { ResetInterval } from "@autumn/shared";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { ENUM_LABELS } from "../../buildRuleSentence";
import { useApprovalsCatalog } from "../../useApprovalsCatalog";
import type { ChipOption } from "../ChipMultiSelect";

const ENUM_VALUES = {
	trial_on_end: ["bill", "revert"],
	plan_schedule: ["immediate", "end_of_cycle"],
	proration_behavior: ["prorate_immediately", "none", "bill_difference"],
	cancel_action: ["cancel_end_of_cycle", "cancel_immediately"],
	reset_interval: Object.values(ResetInterval) as string[],
	billing_cycle_anchor: ["now", "unchanged", "custom"],
};

const LABELS: Record<string, string> = {
	...ENUM_LABELS,
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

const toOption = ({ id, name }: { id: string; name?: string | null }) => ({
	value: id,
	label: name || id,
});

const enumOptions = (values: string[]) =>
	values.map((value) => ({ value, label: enumLabel(value) }));

const useFeatureOptions = () => useApprovalsCatalog().features.map(toOption);
const useRewardOptions = () => useRewardsQuery().rewards.map(toOption);
const usePlanOptions = () => {
	const { products } = useApprovalsCatalog();
	return [...new Map(products.map((plan) => [plan.id, plan])).values()].map(
		toOption,
	);
};

/** Each source's options hook; fixed enums fetch nothing. */
export const OPTION_HOOKS: Record<OptionSource, () => ChipOption[]> = {
	...(Object.fromEntries(
		Object.entries(ENUM_VALUES).map(([source, values]) => [
			source,
			() => enumOptions(values),
		]),
	) as Record<keyof typeof ENUM_VALUES, () => ChipOption[]>),
	feature: useFeatureOptions,
	reward: useRewardOptions,
	catalog_plan: usePlanOptions,
};
