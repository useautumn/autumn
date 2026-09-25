import type { TrialContext } from "@autumn/shared";

export const isRevertTrialContext = ({
	trialContext,
}: {
	trialContext?: TrialContext;
}) => trialContext?.onEnd === "revert";
