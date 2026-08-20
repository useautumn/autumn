import type { FreeTrial } from "@autumn/shared";

/** At most one row per lane. Retired rows are kept with is_custom: true. */
export type FreeTrialPlan = {
	/** True when this plan mints or retires a row. */
	changed: boolean;
	new: FreeTrial | null;
	same: FreeTrial | null;
	retired: FreeTrial | null;
	projected: FreeTrial | null;
};
