import { OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

export const PRICE_PER_SEAT = 50;
const INCLUDED_USAGE = 1;
export const BASE_PRICE = 20;

export const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: PRICE_PER_SEAT,
	includedUsage: INCLUDED_USAGE,
	config: {
		on_increase: OnIncrease.ProrateNextCycle,
		on_decrease: OnDecrease.ProrateNextCycle,
	},
});
