import type { DeductionOptions } from "../../../deduction/types/deductionOptions.js";
import type { DeductionRequest } from "../../../deduction/types/deductionRequest.js";
import type { BalanceContext } from "../../../types/balanceContext.js";

// The balance context plus what track asks of the kernel: one request per
// relevant feature, and the clamps the command's overage behaviour implies.
export type TrackContext = BalanceContext & {
	requests: DeductionRequest[];
	options: DeductionOptions;
};
