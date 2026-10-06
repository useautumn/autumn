import type { createTwStripeRequestDeadline } from "../createTwStripeRequestDeadline";
import type { TwStripeLane } from "./twStripeAdmission";

export type TwStripeRequestContext = {
	lane?: TwStripeLane;
	deadline?: ReturnType<typeof createTwStripeRequestDeadline>;
	/** The test file attempt that caused this request, from the x-tw-test-file header. */
	fileTag?: string;
};
