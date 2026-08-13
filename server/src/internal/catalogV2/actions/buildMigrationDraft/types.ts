import { type DiffedCustomizePlanV1, toBasePriceParams } from "@autumn/shared";

type PreviousPrice = ReturnType<typeof toBasePriceParams> | null;

/** One changed (plan_id, version) row that should participate in a draft. */
export type MigrationTarget = {
	planId: string;
	version: number;
	/** Migratable keys only (`price` / `add_items` / `remove_items`). */
	customize: DiffedCustomizePlanV1;
	previousPrice: PreviousPrice;
	hasBillingChanges: boolean;
	includeCustom: boolean;
};
