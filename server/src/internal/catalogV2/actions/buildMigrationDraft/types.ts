import type {
	ApiPlanItemV1,
	DiffedCustomizePlanV1,
	toBasePriceParams,
} from "@autumn/shared";

type PreviousPrice = ReturnType<typeof toBasePriceParams> | null;

/** One changed (plan_id, version) row that should participate in a draft. */
export type MigrationTarget = {
	planId: string;
	version: number;
	/** Migratable keys only (`price` / `add_items` / `remove_items` / `upsert_licenses`). */
	customize: DiffedCustomizePlanV1;
	previousPrice: PreviousPrice;
	/** Source plan items, for display-only previous_feature_override stamps. */
	previousItems?: ApiPlanItemV1[];
	hasBillingChanges: boolean;
	includeCustom: boolean;
};
