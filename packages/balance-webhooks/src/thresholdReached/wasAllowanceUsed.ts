import type { TrackResult } from "@autumn/balance-engine";
import type { FundingBalance } from "./types/fundingBalance.js";

const deductedBy = ({ result }: { result: TrackResult }): number =>
	result.deltas.reduce((deducted, delta) => deducted - delta.balanceDelta, 0);

export const wasAllowanceUsed = ({
	result,
	fundingBalance,
}: {
	result: TrackResult;
	fundingBalance: FundingBalance;
}): boolean => {
	if (result.status !== "applied" || fundingBalance.unlimited) return false;
	const deducted = deductedBy({ result });
	if (deducted <= 0) return false;

	const oneUnit = result.fundingCreditCost;
	const includedAfter = fundingBalance.granted - fundingBalance.usage;
	const includedBefore = includedAfter + deducted;
	return includedBefore >= oneUnit && includedAfter < oneUnit;
};
