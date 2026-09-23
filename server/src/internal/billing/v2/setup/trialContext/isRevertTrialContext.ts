import type { TrialContext } from "@autumn/shared";

/** Revert trials are Autumn-only: they ride the paused plan's subscription and never write to Stripe. */
export const isRevertTrialContext = ({
	trialContext,
}: {
	trialContext?: TrialContext;
}) => trialContext?.onEnd === "revert";
