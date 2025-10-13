// import { AuthErrorCode } from "../archivedCodes/auth.js";
// import { AutumnError } from "./base.js";

// /**
//  * No secret key provided error
//  */
// export class NoSecretKeyError extends AutumnError {
// 	constructor(message = "No secret key provided") {
// 		super({
// 			message,
// 			code: AuthErrorCode.NoSecretKey,
// 			statusCode: 401,
// 		});
// 		this.name = "NoSecretKeyError";
// 	}
// }

// /**
//  * Invalid secret key error
//  */
// export class InvalidSecretKeyError extends AutumnError {
// 	constructor(message = "Invalid secret key") {
// 		super({
// 			message,
// 			code: AuthErrorCode.InvalidSecretKey,
// 			statusCode: 401,
// 		});
// 		this.name = "InvalidSecretKeyError";
// 	}
// }

// /**
//  * No auth header error
//  */
// export class NoAuthHeaderError extends AutumnError {
// 	constructor(message = "No authorization header provided") {
// 		super({
// 			message,
// 			code: AuthErrorCode.NoAuthHeader,
// 			statusCode: 401,
// 		});
// 		this.name = "NoAuthHeaderError";
// 	}
// }

// /**
//  * Invalid auth header error
//  */
// export class InvalidAuthHeaderError extends AutumnError {
// 	constructor(message = "Invalid authorization header") {
// 		super({
// 			message,
// 			code: AuthErrorCode.InvalidAuthHeader,
// 			statusCode: 401,
// 		});
// 		this.name = "InvalidAuthHeaderError";
// 	}
// }

// /**
//  * Invalid API version error
//  */
// export class InvalidApiVersionError extends AutumnError {
// 	constructor(version: string) {
// 		super({
// 			message: `Invalid API version: ${version}`,
// 			code: AuthErrorCode.InvalidApiVersion,
// 			statusCode: 400,
// 		});
// 		this.name = "InvalidApiVersionError";
// 	}
// }

// /**
//  * No publishable key error
//  */
// export class NoPublishableKeyError extends AutumnError {
// 	constructor(message = "No publishable key provided") {
// 		super({
// 			message,
// 			code: AuthErrorCode.NoPublishableKey,
// 			statusCode: 401,
// 		});
// 		this.name = "NoPublishableKeyError";
// 	}
// }

// /**
//  * Invalid publishable key error
//  */
// export class InvalidPublishableKeyError extends AutumnError {
// 	constructor(message = "Invalid publishable key") {
// 		super({
// 			message,
// 			code: AuthErrorCode.InvalidPublishableKey,
// 			statusCode: 401,
// 		});
// 		this.name = "InvalidPublishableKeyError";
// 	}
// }

// /**
//  * Endpoint not public error
//  */
// export class EndpointNotPublicError extends AutumnError {
// 	constructor(message = "This endpoint is not public") {
// 		super({
// 			message,
// 			code: AuthErrorCode.EndpointNotPublic,
// 			statusCode: 403,
// 		});
// 		this.name = "EndpointNotPublicError";
// 	}
// }
