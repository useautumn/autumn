import type { createTwStripeRequestDeadline } from "../createTwStripeRequestDeadline";
import type { TwStripeLane } from "./twStripeAdmission";

export type TwStripeRequestContext = {
	lane?: TwStripeLane;
	deadline?: ReturnType<typeof createTwStripeRequestDeadline>;
};
