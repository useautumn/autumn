import type { ReviewChangeSystem } from "../../utils/review/types/reviewChange";

export type ReviewGroupValue = "plans" | "balances" | "subscription";

export type ReviewGroup = {
	value: ReviewGroupValue;
	system: ReviewChangeSystem;
	title: string;
};

export const REVIEW_GROUPS: ReviewGroup[] = [
	{ value: "plans", system: "autumn", title: "Plans" },
	{ value: "balances", system: "autumn", title: "Balances" },
	{ value: "subscription", system: "stripe", title: "Subscription" },
];

export const DEFAULT_OPEN_REVIEW_GROUP: ReviewGroupValue = "plans";
