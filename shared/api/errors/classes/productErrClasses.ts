import { AutumnError } from "../base/AutumnError.js";
import { ProductErrorCode } from "../codes/productErrCodes.js";

/**
 * Product not found error
 */
export class ProductNotFoundError extends AutumnError {
	constructor(opts: { productId: string; version?: string }) {
		super({
			message: `Product ${opts.productId} ${opts.version ? ` (version ${opts.version})` : ""} not found`,
			code: ProductErrorCode.ProductNotFound,
			statusCode: 404,
		});
		this.name = "ProductNotFoundError";
	}
}

/**
 * Product already exists error
 */
export class ProductAlreadyExistsError extends AutumnError {
	constructor(opts: { productId: string; message?: string }) {
		super({
			message: opts.message || `Product ${opts.productId} already exists`,
			code: ProductErrorCode.ProductAlreadyExists,
			statusCode: 400,
		});
		this.name = "ProductAlreadyExistsError";
	}
}
