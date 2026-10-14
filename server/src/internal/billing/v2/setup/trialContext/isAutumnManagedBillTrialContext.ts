import type { TrialContext } from "@autumn/shared";
import { isRevertTrialContext } from "./isRevertTrialContext";

export const isAutumnManagedBillTrialContext = ({
	trialContext,
}: {
	trialContext?: TrialContext;
}): boolean =>
	Boolean(trialContext?.autumnManaged) &&
	!isRevertTrialContext({ trialContext });
