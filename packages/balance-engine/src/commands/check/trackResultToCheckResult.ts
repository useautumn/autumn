import { Decimal } from "decimal.js";
import type { TrackResult } from "../track/types/trackResult.js";
import type { CheckResult } from "./types/checkResult.js";

/** A deducting check decided by its one track: whether the track applied is the answer, in the funding feature's units. */
export const trackResultToCheckResult = ({
	result,
	requiredBalance,
}: {
	result: Pick<
		TrackResult,
		"status" | "fundingFeatureId" | "fundingCreditCost"
	>;
	requiredBalance: number;
}): CheckResult => {
	const allowed = result.status === "applied";
	return {
		allowed,
		reason: allowed ? null : "insufficient_balance",
		// A refused track does not say which limit refused it; only a plain check does.
		limitType: null,
		requiredBalance: new Decimal(requiredBalance)
			.mul(result.fundingCreditCost)
			.toNumber(),
		fundingFeatureId: result.fundingFeatureId,
		isFlag: false,
	};
};
