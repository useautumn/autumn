import { AutumnCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { AutumnError } from "../models/autumn-error.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/http-client-errors.js";
import * as models from "../models/index.js";
import { ResponseValidationError } from "../models/response-validation-error.js";
import { SDKValidationError } from "../models/sdk-validation-error.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Creates a customer if they do not exist, or returns the existing customer by your external customer ID.
 *
 * Use this as the primary entrypoint before billing operations so the customer record is always present and up to date.
 *
 * @example
 * ```typescript
 * // Create or fetch a customer by external ID
 * const response = await client.getOrCreate({ customerId: "cus_123", name: "John Doe", email: "john@example.com" });
 * ```
 *
 * @param id - Your unique identifier for the customer (optional)
 * @param name - Customer's name (optional)
 * @param email - Customer's email address (optional)
 * @param fingerprint - Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse (optional)
 * @param metadata - Additional metadata for the customer (optional)
 * @param stripeId - Stripe customer ID if you already have one (optional)
 * @param createInStripe - Whether to create the customer in Stripe (optional)
 * @param autoEnablePlanId - The ID of the free plan to auto-enable for the customer (optional)
 * @param sendEmailReceipts - Whether to send email receipts to this customer (optional)
 * @param billingControls - Billing controls for the customer (auto top-ups, etc.) (optional)
 * @param expand - Fields to expand in the returned customer response, such as subscriptions.plan, purchases.plan, balances.feature, or flags.feature. (optional)
 */
export declare function customersGetOrCreate(client: AutumnCore, request: models.GetOrCreateCustomerParams, options?: RequestOptions): APIPromise<Result<models.Customer, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
