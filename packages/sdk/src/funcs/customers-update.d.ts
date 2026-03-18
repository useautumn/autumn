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
 * Updates an existing customer by ID.
 */
export declare function customersUpdate(client: AutumnCore, request: models.UpdateCustomerParams, options?: RequestOptions): APIPromise<Result<models.UpdateCustomerResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
