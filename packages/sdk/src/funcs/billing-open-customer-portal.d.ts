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
 * Create a billing portal session for a customer to manage their subscription.
 */
export declare function billingOpenCustomerPortal(client: AutumnCore, request: models.OpenCustomerPortalParams, options?: RequestOptions): APIPromise<Result<models.OpenCustomerPortalResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
