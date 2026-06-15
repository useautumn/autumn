import { RecaseError } from "../base/RecaseError.js";
import { BalancesErrorCode } from "../codes/balancesErrCodes.js";

const buildInsufficientBalanceMessage = (opts: {
	value: number;
	featureId?: string;
	eventName?: string;
	balance?: number;
}) => {
	const target = opts.featureId
		? `feature ${opts.featureId}`
		: `event ${opts.eventName}`;
	if (opts.balance !== undefined) {
		return `Insufficient balance for ${target}: ${opts.balance} available, tried to deduct ${opts.value}`;
	}
	return `Insufficient balance to deduct ${opts.value} from ${target}`;
};

export class InsufficientBalanceError extends RecaseError {
	constructor(opts?: {
		message?: string;
		value: number;
		featureId?: string;
		eventName?: string;
		balance?: number;
	}) {
		super({
			message:
				opts?.message ||
				buildInsufficientBalanceMessage({
					value: opts?.value ?? 1,
					featureId: opts?.featureId,
					eventName: opts?.eventName,
					balance: opts?.balance,
				}),
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
