import { RecaseError } from "../base/RecaseError.js";
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

export class UsageLimitExceededError extends RecaseError {
	constructor(opts?: {
		message?: string;
		featureId?: string;
		limit?: number;
	}) {
		super({
			message:
				opts?.message ||
				`Usage limit exceeded${opts?.featureId ? ` for feature ${opts.featureId}` : ""}${opts?.limit !== undefined ? ` (limit ${opts.limit})` : ""}`,
			code: BalancesErrorCode.UsageLimitExceeded,
			// 400 (mirrors InsufficientBalanceError): clients flatten any 429 to a
			// generic rate-limit error, which would hide the usage_limit_exceeded code.
			statusCode: 400,
		});
		this.name = "UsageLimitExceededError";
	}
}
