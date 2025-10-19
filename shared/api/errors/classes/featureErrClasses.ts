import { RecaseError } from "../base/RecaseError.js";
import { FeatureErrorCode } from "../codes/featureErrCodes.js";

/**
 * Product not found error
 */
export class FeatureAlreadyExistsError extends RecaseError {
	constructor(opts: { productId: string; version?: string }) {
		super({
			message: `Product ${opts.productId} ${opts.version ? ` (version ${opts.version})` : ""} not found`,
			code: FeatureErrorCode.FeatureAlreadyExists,
			statusCode: 404,
		});
		this.name = "ProductNotFoundError";
	}
}

/**
 * Feature not found error
 */
export class FeatureNotFoundError extends RecaseError {
	constructor(opts: { featureId: string }) {
		super({
			message: `Feature ${opts.featureId} not found`,
			code: FeatureErrorCode.FeatureNotFound,
			statusCode: 404,
		});
	}
}
