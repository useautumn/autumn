import { RecaseError } from "../base/RecaseError.js";
import { CusErrorCode } from "../codes/cusErrCodes.js";

/**
 * Customer not found error
 */
export class CustomerNotFoundError extends RecaseError {
	constructor(opts: { customerId: string }) {
		super({
			message: `Customer ${opts.customerId} not found`,
			code: CusErrorCode.CustomerNotFound,
			statusCode: 404,
		});
		this.name = "CustomerNotFoundError";
	}
}
