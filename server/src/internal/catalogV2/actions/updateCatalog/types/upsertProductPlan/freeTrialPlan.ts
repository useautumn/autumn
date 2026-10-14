import type { FreeTrial } from "@autumn/shared";

export type FreeTrialPlan = {
	changed: boolean;
	new: FreeTrial | null;
	same: FreeTrial | null;
	retired: FreeTrial | null;
	projected: FreeTrial | null;
};
