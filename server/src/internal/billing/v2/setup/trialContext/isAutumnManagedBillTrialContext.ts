import type { TrialContext } from "@autumn/shared";
import { isRevertTrialContext } from "./isRevertTrialContext";

/** A no-card trial Autumn runs itself and bills at trial end (not a revert trial). */
export const isAutumnManagedBillTrialContext = ({
	trialContext,
}: {
	trialContext?: TrialContext;
}): boolean =>
	Boolean(trialContext?.autumnManaged) &&
	!isRevertTrialContext({ trialContext });
