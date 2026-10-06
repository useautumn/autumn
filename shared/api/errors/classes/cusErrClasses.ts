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

export class CustomerAlreadyExistsError extends RecaseError {
	constructor(opts: { message?: string; customerId: string }) {
		super({
			message: opts.message || `Customer ${opts.customerId} already exists`,
			code: CusErrorCode.CustomerAlreadyExists,
			statusCode: 409,
		});
		this.name = "CustomerAlreadyExistsError";
	}
}

export class CustomerTaxLocationMissingError extends RecaseError {
	constructor(opts: { customerId: string }) {
		super({
			message: `Automatic tax is enabled but customer ${opts.customerId} has no billing address. Pass billing_details.address, set billing_details.tax_exempt to "exempt", or pass tax.automatic_tax.enabled: false.`,
			code: CusErrorCode.CustomerTaxLocationMissing,
			statusCode: 400,
			details: { customer_id: opts.customerId },
		});
		this.name = "CustomerTaxLocationMissingError";
	}
}
