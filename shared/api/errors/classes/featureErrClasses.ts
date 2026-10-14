import { RecaseError } from "../base/RecaseError.js";
import { FeatureErrorCode } from "../codes/featureErrCodes.js";

export class FeatureAlreadyExistsError extends RecaseError {
	constructor(opts: { featureId: string }) {
		super({
			message: `Feature ${opts.featureId} already exists`,
			code: FeatureErrorCode.FeatureAlreadyExists,
			statusCode: 409,
		});
		this.name = "FeatureAlreadyExistsError";
	}
}

export class FeatureNotFoundError extends RecaseError {
	constructor(opts: { featureId: string }) {
		super({
			message: `Feature ${opts.featureId} not found`,
			code: FeatureErrorCode.FeatureNotFound,
			statusCode: 404,
		});
		this.name = "FeatureNotFoundError";
	}
}
