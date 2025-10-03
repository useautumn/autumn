// import { GeneralErrorCode } from "../archivedCodes/general.js";
// import { AutumnError } from "./base.js";

// /**
//  * Invalid request error
//  */
// export class InvalidRequestError extends AutumnError {
// 	constructor(message = "Invalid request") {
// 		super({
// 			message,
// 			code: GeneralErrorCode.InvalidRequest,
// 			statusCode: 400,
// 		});
// 		this.name = "InvalidRequestError";
// 	}
// }

// /**
//  * Invalid inputs error (typically for validation failures)
//  */
// export class InvalidInputsError extends AutumnError {
// 	constructor(message = "Invalid inputs") {
// 		super({
// 			message,
// 			code: GeneralErrorCode.InvalidInputs,
// 			statusCode: 400,
// 		});
// 		this.name = "InvalidInputsError";
// 	}
// }

// /**
//  * Internal server error
//  */
// export class InternalError extends AutumnError {
// 	constructor(message = "Internal server error") {
// 		super({
// 			message,
// 			code: GeneralErrorCode.InternalError,
// 			statusCode: 500,
// 		});
// 		this.name = "InternalError";
// 	}
// }

// /**
//  * Organization not found error
//  */
// export class OrgNotFoundError extends AutumnError {
// 	constructor(message = "Organization not found") {
// 		super({
// 			message,
// 			code: GeneralErrorCode.OrgNotFound,
// 			statusCode: 404,
// 		});
// 		this.name = "OrgNotFoundError";
// 	}
// }

// /**
//  * Feature not found error
//  */
// export class FeatureNotFoundError extends AutumnError {
// 	constructor(featureId: string) {
// 		super({
// 			message: `Feature ${featureId} not found`,
// 			code: GeneralErrorCode.FeatureNotFound,
// 			statusCode: 404,
// 		});
// 		this.name = "FeatureNotFoundError";
// 	}
// }

// /**
//  * Invalid feature error
//  */
// export class InvalidFeatureError extends AutumnError {
// 	constructor(message = "Invalid feature") {
// 		super({
// 			message,
// 			code: GeneralErrorCode.InvalidFeature,
// 			statusCode: 400,
// 		});
// 		this.name = "InvalidFeatureError";
// 	}
// }

// /**
//  * Entity not found error
//  */
// export class EntityNotFoundError extends AutumnError {
// 	constructor(entityId: string) {
// 		super({
// 			message: `Entity ${entityId} not found`,
// 			code: GeneralErrorCode.EntityNotFound,
// 			statusCode: 404,
// 		});
// 		this.name = "EntityNotFoundError";
// 	}
// }

// /**
//  * Insufficient balance error
//  */
// export class InsufficientBalanceError extends AutumnError {
// 	constructor(message = "Insufficient balance") {
// 		super({
// 			message,
// 			code: GeneralErrorCode.InsufficientBalance,
// 			statusCode: 400,
// 		});
// 		this.name = "InsufficientBalanceError";
// 	}
// }
