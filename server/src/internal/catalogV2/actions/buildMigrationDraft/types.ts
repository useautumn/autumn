import {
	type ApiPlanItemV1,
	type DiffedCustomizePlanV1,
	toBasePriceParams,
} from "@autumn/shared";

type PreviousPrice = ReturnType<typeof toBasePriceParams> | null;

export type MigrationTarget = {
	planId: string;
	version: number;
	customize: DiffedCustomizePlanV1;
	previousPrice: PreviousPrice;
	previousItems?: ApiPlanItemV1[];
	hasBillingChanges: boolean;
	includeCustom: boolean;
};
