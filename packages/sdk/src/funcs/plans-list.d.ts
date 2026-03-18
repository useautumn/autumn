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
 * List all plans
 *
 * @remarks
 * Lists all plans in the current environment.
 *
 * Use this to retrieve all plans for displaying pricing pages or managing plan configurations.
 *
 * @returns A list of all plans with their pricing and feature configurations.
 */
export declare function plansList(client: AutumnCore, request?: models.ListPlansParams | undefined, options?: RequestOptions): APIPromise<Result<models.ListPlansResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
