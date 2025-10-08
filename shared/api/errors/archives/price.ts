// import { PriceErrorCode } from "../archivedCodes/price.js";
// import { AutumnError } from "./base.js";

// /**
//  * Price not found error
//  */
// export class PriceNotFoundError extends AutumnError {
// 	constructor(priceId: string) {
// 		super({
// 			message: `Price ${priceId} not found`,
// 			code: PriceErrorCode.PriceNotFound,
// 			statusCode: 404,
// 		});
// 		this.name = "PriceNotFoundError";
// 	}
// }

// /**
//  * Invalid price error
//  */
// export class InvalidPriceError extends AutumnError {
// 	constructor(message = "Invalid price") {
// 		super({
// 			message,
// 			code: PriceErrorCode.InvalidPrice,
// 			statusCode: 400,
// 		});
// 		this.name = "InvalidPriceError";
// 	}
// }

// /**
//  * Invalid price config error
//  */
// export class InvalidPriceConfigError extends AutumnError {
// 	constructor(message = "Invalid price configuration") {
// 		super({
// 			message,
// 			code: PriceErrorCode.InvalidPriceConfig,
// 			statusCode: 400,
// 		});
// 		this.name = "InvalidPriceConfigError";
// 	}
// }

// /**
//  * Invalid price options error
//  */
// export class InvalidPriceOptionsError extends AutumnError {
// 	constructor(message = "Invalid price options") {
// 		super({
// 			message,
// 			code: PriceErrorCode.InvalidPriceOptions,
// 			statusCode: 400,
// 		});
// 		this.name = "InvalidPriceOptionsError";
// 	}
// }
