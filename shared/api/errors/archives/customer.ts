// import { CustomerErrorCode } from "../archivedCodes/customer.js";
// import { AutumnError } from "./base.js";

// /**
//  * Customer not found error
//  */
// export class CustomerNotFoundError extends AutumnError {
// 	constructor(customerId: string) {
// 		super({
// 			message: `Customer ${customerId} not found`,
// 			code: CustomerErrorCode.CustomerNotFound,
// 			statusCode: 404,
// 		});
// 		this.name = "CustomerNotFoundError";
// 	}
// }

// /**
//  * Invalid customer error
//  */
// export class InvalidCustomerError extends AutumnError {
// 	constructor(message = "Invalid customer") {
// 		super({
// 			message,
// 			code: CustomerErrorCode.InvalidCustomer,
// 			statusCode: 400,
// 		});
// 		this.name = "InvalidCustomerError";
// 	}
// }

// /**
//  * Customer already has product error
//  */
// export class CustomerAlreadyHasProductError extends AutumnError {
// 	constructor(customerId: string, productId: string) {
// 		super({
// 			message: `Customer ${customerId} already has product ${productId}`,
// 			code: CustomerErrorCode.CustomerAlreadyHasProduct,
// 			statusCode: 400,
// 		});
// 		this.name = "CustomerAlreadyHasProductError";
// 	}
// }

// /**
//  * Customer has no payment method error
//  */
// export class CustomerHasNoPaymentMethodError extends AutumnError {
// 	constructor(message = "Customer has no payment method") {
// 		super({
// 			message,
// 			code: CustomerErrorCode.CustomerHasNoPaymentMethod,
// 			statusCode: 400,
// 		});
// 		this.name = "CustomerHasNoPaymentMethodError";
// 	}
// }

// /**
//  * Multiple customers found error
//  */
// export class MultipleCustomersFoundError extends AutumnError {
// 	constructor(message = "Multiple customers found") {
// 		super({
// 			message,
// 			code: CustomerErrorCode.MultipleCustomersFound,
// 			statusCode: 400,
// 		});
// 		this.name = "MultipleCustomersFoundError";
// 	}
// }

// /**
//  * Duplicate customer ID error
//  */
// export class DuplicateCustomerIdError extends AutumnError {
// 	constructor(customerId: string) {
// 		super({
// 			message: `Customer ${customerId} already exists`,
// 			code: CustomerErrorCode.DuplicateCustomerId,
// 			statusCode: 400,
// 		});
// 		this.name = "DuplicateCustomerIdError";
// 	}
// }

// /**
//  * Duplicate customer email error
//  */
// export class DuplicateCustomerEmailError extends AutumnError {
// 	constructor(email: string) {
// 		super({
// 			message: `Customer with email ${email} already exists`,
// 			code: CustomerErrorCode.DuplicateCustomerEmail,
// 			statusCode: 400,
// 		});
// 		this.name = "DuplicateCustomerEmailError";
// 	}
// }
