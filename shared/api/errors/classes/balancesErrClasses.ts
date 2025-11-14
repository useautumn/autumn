import { RecaseError } from "../../../index.js";
import { BalancesErrorCode } from "../codes/balancesErrCodes.js";

export class InsufficientBalanceError extends RecaseError {
	constructor(opts?: {
		message?: string;
		value: number;
		featureId?: string;
		eventName?: string;
	}) {
		super({
			message:
				opts?.message ||
				`Insufficient balance to deduct ${opts?.value} from ${opts?.featureId ? `feature ${opts?.featureId}` : `event ${opts?.eventName}`}`,
			code: BalancesErrorCode.InsufficientBalance,
			statusCode: 400,
		});
		this.name = "InsufficientBalanceError";
	}
}
