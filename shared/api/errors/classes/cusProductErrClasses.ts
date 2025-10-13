import { RecaseError } from "../base/RecaseError.js";
import { CusProductErrorCode } from "../codes/cusProductErrCodes.js";

/**
 * Product not found error
 */
export class CusProductNotFoundError extends RecaseError {
	constructor(opts: {
		customerId: string;
		productId: string;
		entityId?: string;
	}) {
		const message = opts.entityId
			? `Product ${opts.productId} not found for entity ${opts.entityId}`
			: `Product ${opts.productId} not found for customer ${opts.customerId}`;

		super({
			message,
			code: CusProductErrorCode.CustomerProductNotFound,
			statusCode: 404,
		});
		this.name = "CustomerProductNotFoundError";
	}
}

export class CusProductAlreadyExistsError extends RecaseError {
	constructor(opts: {
		productId: string;
		customerId?: string;
		entityId?: string;
	}) {
		const message = opts.entityId
			? `Entity ${opts.entityId} already has product ${opts.productId}`
			: `Customer ${opts.customerId} already has product ${opts.productId}`;

		super({
			message,
			code: CusProductErrorCode.CustomerProductAlreadyExists,
			statusCode: 400,
		});
		this.name = "CusProductAlreadyExistsError";
	}
}
