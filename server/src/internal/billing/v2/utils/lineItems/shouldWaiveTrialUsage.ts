import { timestampsMatch } from "@autumn/shared";

/** The invoice opening the first paid period (at the trial end) bills no usage accrued during the trial. */
export const shouldWaiveTrialUsage = ({
	trialEndsAtMs,
	periodStartMs,
}: {
	trialEndsAtMs?: number | null;
	periodStartMs: number;
}): boolean =>
	typeof trialEndsAtMs === "number" &&
	timestampsMatch(trialEndsAtMs, periodStartMs);
