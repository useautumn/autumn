import { RecaseError } from "../../../index.js";
import { BalancesErrorCode } from "../codes/balancesErrCodes.js";

export class InsufficientBalanceError extends RecaseError {
	constructor(opts?: { message?: string }) {
		super({
			message: opts?.message || "Insufficient balance",
			code: BalancesErrorCode.InsufficientBalance,
			statusCode: 400,
		});
		this.name = "InsufficientBalanceError";
	}
}
